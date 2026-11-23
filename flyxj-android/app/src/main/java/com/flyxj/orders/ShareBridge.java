package com.flyxj.orders;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.UUID;

/** JavaScript bridge accepts ONLY temporary FLYXJ server-issued file ticket URLs. */
public final class ShareBridge {
    private final Activity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean busy;
    private static final String DOMAIN = "flyxj-order-manager-free.onrender.com";
    private static final int MAX_PDF = 32 * 1024 * 1024;
    private static final int MAX_IMAGE = 14 * 1024 * 1024;

    ShareBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface public void shareFiles(String json) {
        // JavaScriptInterface invokes off the UI thread: do WebView and chooser work on main.
        main.post(() -> handleShare(json));
    }

    private void handleShare(String json) {
        if (busy) { notifyUser("Share already preparing"); return; }
        if (json == null || json.length() > 3000) { notifyUser("Invalid share request"); return; }
        String current = webView.getUrl();
        if (current == null || !current.startsWith("https://" + DOMAIN + "/")) {
            notifyUser("Open FLYXJ website to share order files");
            return;
        }
        final String[] tickets = new String[2];
        try {
            JSONObject request = new JSONObject(json);
            JSONArray files = request.getJSONArray("files");
            if (files.length() != 2) throw new Exception("Combined PNG and PDF are required");
            for (int i = 0; i < 2; i++) {
                String value = files.getString(i);
                Uri url = Uri.parse(value);
                if (!"https".equals(url.getScheme()) || !DOMAIN.equals(url.getHost()) ||
                    url.getPort() != -1 || url.getQuery() != null || url.getFragment() != null ||
                    !url.getPath().matches("/api/mobile-file/[0-9a-f]{64}")) {
                    throw new Exception("Only secure FLYXJ file links can be shared");
                }
                tickets[i] = url.toString();
            }
        } catch (Exception e) { notifyUser("Cannot share: " + e.getMessage()); return; }
        busy = true;
        notifyUser("Preparing PNG + PDF to share...");
        new Thread(() -> {
            ArrayList<Uri> uris = new ArrayList<>();
            try {
                File folder = new File(activity.getCacheDir(), "shared");
                if (!folder.exists() && !folder.mkdirs()) throw new Exception("Cannot prepare private cache");
                for (int i = 0; i < tickets.length; i++) {
                    boolean pdf = i == 1;
                    String name = UUID.randomUUID().toString().replace("-", "") + (pdf ? ".pdf" : ".png");
                    File target = new File(folder, name);
                    download(tickets[i], target, pdf ? MAX_PDF : MAX_IMAGE, pdf);
                    Uri uri = new Uri.Builder().scheme("content").authority(ShareFileProvider.AUTHORITY)
                        .appendPath("shared").appendPath(name).build();
                    uris.add(uri);
                }
                main.post(() -> {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND_MULTIPLE);
                        send.setType("*/*");
                        send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                        ClipData clip = ClipData.newUri(activity.getContentResolver(), "FlyXJ order files", uris.get(0));
                        for (int i = 1; i < uris.size(); i++)
                            clip.addItem(new ClipData.Item(uris.get(i)));
                        send.setClipData(clip);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(Intent.createChooser(send, "Share FLYXJ PNG + PDF"));
                    } catch (Exception error) {
                        Toast.makeText(activity, "Share menu unavailable: " + error.getMessage(), Toast.LENGTH_LONG).show();
                    } finally { busy = false; }
                });
            } catch (Exception error) {
                main.post(() -> {
                    busy = false;
                    Toast.makeText(activity, "Share failed: " + error.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    private void download(String address, File file, int limit, boolean pdf) throws Exception {
        HttpURLConnection conn = (HttpURLConnection)new URL(address).openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(12000);
        conn.setReadTimeout(25000);
        conn.setRequestProperty("Accept", pdf ? "application/pdf" : "image/png");
        try {
            if (conn.getResponseCode() != 200) throw new Exception("File link expired. Reopen order and retry.");
            String mime = conn.getContentType();
            if (mime == null || !(pdf ? mime.startsWith("application/pdf") : mime.startsWith("image/png")))
                throw new Exception("Unexpected file format");
            if (conn.getContentLengthLong() > limit) throw new Exception("Attachment too large");
            int count = 0;
            try (InputStream input = conn.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                byte[] buffer = new byte[16384];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    count += length;
                    if (count > limit) throw new Exception("File exceeds share size limit");
                    output.write(buffer, 0, length);
                }
            }
            if (count < 20) throw new Exception("Attachment missing");
        } catch (Exception error) {
            file.delete();
            throw error;
        } finally { conn.disconnect(); }
    }

    private void notifyUser(String message) {
        main.post(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }
}
