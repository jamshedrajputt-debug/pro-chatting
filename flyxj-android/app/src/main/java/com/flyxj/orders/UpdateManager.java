package com.flyxj.orders;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Checks the FlyXJ GitHub release on every app launch and offers native APK installation.
 * Android always asks the user to approve installing a new APK.
 */
public final class UpdateManager {
    private static final String API =
        "https://api.github.com/repos/jamshedrajputt-debug/pro-chatting/releases/latest";
    private final Activity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private long downloadId = -1L;
    private BroadcastReceiver receiver;

    public UpdateManager(Activity activity) { this.activity = activity; }

    public void check() {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection)new URL(API).openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "FlyXJ-Android-Updater");
                if(conn.getResponseCode()!=200)return;
                StringBuilder body = new StringBuilder();
                try(BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                    String line;
                    while((line=reader.readLine())!=null && body.length()<200000)
                        body.append(line);
                }
                JSONObject obj = new JSONObject(body.toString());
                Matcher m = Pattern.compile("^flyxj-android-v([0-9]+)$")
                    .matcher(obj.optString("tag_name"));
                if(!m.matches())return;
                int latest = Integer.parseInt(m.group(1));
                int current = activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(),0).versionCode;
                if(latest<=current)return;
                JSONArray assets=obj.optJSONArray("assets");
                if(assets==null)return;
                for(int i=0;i<assets.length();i++){
                    JSONObject asset=assets.optJSONObject(i);
                    if(asset==null)continue;
                    String downloadUrl=asset.optString("browser_download_url");
                    if(asset.optString("name").endsWith(".apk")
                        &&downloadUrl.startsWith(
                           "https://github.com/jamshedrajputt-debug/pro-chatting/releases/download/")){
                        String info=obj.optString("body","FLYXJ has a new version.");
                        if(info.length()>500)info=info.substring(0,500);
                        final String releaseNotes=info;
                        ui.post(() -> new AlertDialog.Builder(activity)
                            .setTitle("FLYXJ Update Available · v"+latest)
                            .setMessage(releaseNotes+"\n\nUpdate will download an APK. Android will ask you to approve installation. Your login may need to be entered again.")
                            .setPositiveButton("Update Now",(d,w)->startDownload(downloadUrl,latest))
                            .setNegativeButton("Later",null)
                            .show());
                        return;
                    }
                }
            }catch(Exception ignored) {
                // Offline / API downtime must never block the order manager.
            }finally{if(conn!=null)conn.disconnect();}
        }).start();
    }

    private void startDownload(String url,int version) {
        try {
            DownloadManager manager=(DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if(manager==null)throw new IllegalStateException("Android Download Manager unavailable");
            String filename="FLYXJ-Order-Manager-v"+version+".apk";
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(filename);
            request.setDescription("FlyXJ app update");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,filename);
            downloadId=manager.enqueue(request);
            Toast.makeText(activity,"Downloading FlyXJ update…",Toast.LENGTH_LONG).show();
            receiver=new BroadcastReceiver(){
                @Override public void onReceive(Context context, Intent intent) {
                    if(!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction()))return;
                    if(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1)!=downloadId)return;
                    try { activity.unregisterReceiver(this); }catch(Exception ignored){}
                    receiver=null;
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
                    try(android.database.Cursor c=manager.query(query)) {
                        if(c!=null&&c.moveToFirst()) {
                            int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            if(status==DownloadManager.STATUS_SUCCESSFUL) install(manager.getUriForDownloadedFile(downloadId));
                            else Toast.makeText(activity,"Update download failed. Try again.",Toast.LENGTH_LONG).show();
                        }
                    }
                }
            };
            IntentFilter filter=new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if(Build.VERSION.SDK_INT>=33)
                activity.registerReceiver(receiver,filter,Context.RECEIVER_NOT_EXPORTED);
            else activity.registerReceiver(receiver,filter);
        }catch(Exception ex){
            Toast.makeText(activity,"Update error: "+ex.getMessage(),Toast.LENGTH_LONG).show();
        }
    }
    private void install(Uri apkUri){
        if(apkUri==null){Toast.makeText(activity,"Update file not found",Toast.LENGTH_LONG).show();return;}
        if(Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity)
              .setTitle("Allow FLYXJ app updates")
              .setMessage("Android requires you to allow installing updates from this app once. After enabling it, return to Downloads and open the downloaded FlyXJ APK.")
              .setPositiveButton("Open Settings",(d,w)->{
                  Intent settings=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                      Uri.parse("package:"+activity.getPackageName()));
                  activity.startActivity(settings);
              }).setNegativeButton("Later",null).show();
            return;
        }
        try{
            Intent intent=new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri,"application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        }catch(ActivityNotFoundException ex){
            Toast.makeText(activity,"Open Downloads to install FlyXJ update.",Toast.LENGTH_LONG).show();
        }
    }
}
