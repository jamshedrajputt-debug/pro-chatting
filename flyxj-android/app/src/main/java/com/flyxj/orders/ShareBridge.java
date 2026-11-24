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

/** Secure short-lived original photo and PDF share chooser for FLYXJ orders. */
public final class ShareBridge {
    private final Activity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean busy;
    private static final String DOMAIN = "flyxj-order-manager-free.onrender.com";
    private static final int MAX_SINGLE_BYTES = 32 * 1024 * 1024;
    private static final long MAX_TOTAL_BYTES = 64L * 1024 * 1024;

    ShareBridge(Activity activity, WebView webView) {
        this.activity=activity;
        this.webView=webView;
    }

    @JavascriptInterface public void shareFiles(String json) {
        main.post(() -> handleShare(json));
    }

    private void handleShare(String json) {
        if(busy) { notifyUser("Already preparing shared files"); return; }
        if(json==null||json.length()>4500) { notifyUser("Invalid sharing request"); return; }
        final Uri[] links;
        final String[] types;
        final String title;
        try {
            Uri current=Uri.parse(webView.getUrl());
            if(!"https".equals(current.getScheme())||!DOMAIN.equals(current.getHost())||
               current.getPort()!=-1)throw new Exception("Open FLYXJ first");
            JSONObject payload=new JSONObject(json);
            JSONArray files=payload.getJSONArray("files");
            if(files.length()<1||files.length()>8)throw new Exception("Choose 1 to 8 original files");
            JSONArray formats=payload.optJSONArray("types");
            if(formats!=null&&formats.length()!=files.length())throw new Exception("Invalid file types");
            links=new Uri[files.length()];
            types=new String[files.length()];
            for(int i=0;i<files.length();i++){
                Uri url=Uri.parse(files.getString(i));
                if(!"https".equals(url.getScheme())||!DOMAIN.equals(url.getHost())||
                   url.getPort()!=-1||url.getQuery()!=null||url.getFragment()!=null||
                   !url.getPath().matches("/api/mobile-file/[0-9a-f]{64}"))
                    throw new Exception("Untrusted file link");
                links[i]=url;
                String mime=formats==null?(i==0?"image/png":"application/pdf"):formats.getString(i);
                if(!mime.equals("image/jpeg")&&!mime.equals("image/png")&&!mime.equals("image/webp")&&!mime.equals("application/pdf"))
                    throw new Exception("Unsupported attachment type");
                types[i]=mime;
            }
            title=payload.optString("title","Share FLYXJ order files");
        } catch(Exception e) {
            notifyUser("Share cancelled: "+e.getMessage());return;
        }
        busy=true;
        notifyUser("Preparing "+links.length+" original file(s)...");
        new Thread(() -> {
            ArrayList<Uri> shareUris=new ArrayList<>();
            long total=0;
            try {
                File directory=new File(activity.getCacheDir(),"shared");
                if(!directory.exists()&&!directory.mkdirs())throw new Exception("Private cache unavailable");
                // Remove old transient share data only; no customer images are modified remotely.
                File[] older=directory.listFiles();
                if(older!=null)for(File old:older)if(old.isFile()&&System.currentTimeMillis()-old.lastModified()>6L*60L*60L*1000L)old.delete();
                for(int i=0;i<links.length;i++){
                    String extension=types[i].equals("application/pdf")?".pdf":
                       types[i].equals("image/jpeg")?".jpg":
                       types[i].equals("image/webp")?".webp":".png";
                    String randomName=UUID.randomUUID().toString().replace("-","")+extension;
                    File target=new File(directory,randomName);
                    long bytes=download(links[i].toString(),target,types[i]);
                    total+=bytes;
                    if(total>MAX_TOTAL_BYTES){target.delete();throw new Exception("Total share size too large");}
                    Uri uri=new Uri.Builder().scheme("content").authority(ShareFileProvider.AUTHORITY)
                        .appendPath("shared").appendPath(randomName).build();
                    shareUris.add(uri);
                }
                main.post(() -> {
                    try{
                        boolean images=true,allPdf=true;
                        for(String type:types){if(!type.startsWith("image/"))images=false;if(!type.equals("application/pdf"))allPdf=false;}
                        String mime=images?"image/*":allPdf?"application/pdf":"*/*";
                        Intent share=new Intent(shareUris.size()==1?Intent.ACTION_SEND:Intent.ACTION_SEND_MULTIPLE);
                        share.setType(mime);
                        if(shareUris.size()==1)share.putExtra(Intent.EXTRA_STREAM,shareUris.get(0));
                        else share.putParcelableArrayListExtra(Intent.EXTRA_STREAM,shareUris);
                        ClipData clip=ClipData.newUri(activity.getContentResolver(),"FLYXJ order",shareUris.get(0));
                        for(int i=1;i<shareUris.size();i++)clip.addItem(new ClipData.Item(shareUris.get(i)));
                        share.setClipData(clip);
                        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(Intent.createChooser(share,title.length()>75?title.substring(0,75):title));
                    } catch(Exception e){notifyUser("Share menu error: "+e.getMessage());}
                    finally{busy=false;}
                });
            }catch(Exception e){
                main.post(() -> {busy=false;notifyUser("Sharing failed: "+e.getMessage());});
            }
        },"FLYXJ-private-file-share").start();
    }

    private long download(String link,File file,String expectedType) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)new URL(link).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(25000);
        connection.setRequestProperty("Accept",expectedType);
        try{
            if(connection.getResponseCode()!=200)throw new Exception("Order file expired. Retry sharing.");
            String responseType=connection.getContentType();
            if(responseType==null||!responseType.toLowerCase().startsWith(expectedType))
                throw new Exception("Unexpected image/PDF format");
            if(connection.getContentLengthLong()>MAX_SINGLE_BYTES)
                throw new Exception("File too large");
            int count=0;
            try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(file)){
                byte[] buffer=new byte[16384];int length;
                while((length=in.read(buffer))!=-1){
                    count+=length;
                    if(count>MAX_SINGLE_BYTES)throw new Exception("Photo exceeds limit");
                    out.write(buffer,0,length);
                }
            }
            if(count<20)throw new Exception("Empty original file");
            return count;
        }catch(Exception error){file.delete();throw error;}
        finally{connection.disconnect();}
    }

    private void notifyUser(String text){
        main.post(() -> Toast.makeText(activity,text,Toast.LENGTH_SHORT).show());
    }
}
