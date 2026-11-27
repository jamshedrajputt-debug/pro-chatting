package com.flyxj.orders;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Native FLYXJ two-way system notifications. No secrets are stored in app prefs. */
public final class AlertBridge {
    static final String PREFS = "flyxj-notify-v9";
    static final String CHANNEL = "flyxj_orders_v9";
    static final String HOST = "flyxj-order-manager-free.onrender.com";
    static final int JOB = 27119;
    private final Activity activity;
    private final WebView web;
    AlertBridge(Activity activity,WebView web){this.activity=activity;this.web=web;ensureChannel(activity);}
    private boolean trusted(){
        android.net.Uri url=android.net.Uri.parse(web.getUrl()==null?"":web.getUrl());
        return "https".equals(url.getScheme()) && HOST.equals(url.getHost()) && url.getPort()==-1;
    }
    @JavascriptInterface public void register(String username){
        activity.runOnUiThread(()->{
            if(!trusted()||username==null||!username.matches("[a-zA-Z0-9_-]{3,30}"))return;
            SharedPreferences p=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            String key="baseline:"+username;
            if(!p.contains(key))p.edit().putString(key,new java.text.SimpleDateFormat(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US){{
                    setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                }}.format(new java.util.Date())).apply();
            p.edit().putString("activeUser",username).apply();
            JobScheduler scheduler=(JobScheduler)activity.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if(scheduler!=null){
                JobInfo job=new JobInfo.Builder(JOB,new ComponentName(activity,AlertPollJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15*60*1000L).setPersisted(false).build();
                scheduler.schedule(job);
            }
            requestPermission();
        });
    }
    @JavascriptInterface public void unregister(){
        activity.runOnUiThread(()->{
            if(!trusted())return;
            activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().remove("activeUser").apply();
            JobScheduler jobs=(JobScheduler)activity.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if(jobs!=null)jobs.cancel(JOB);
        });
    }
    @JavascriptInterface public void requestPermission(){
        activity.runOnUiThread(()->{
            if(!trusted())return;
            if(Build.VERSION.SDK_INT>=33&&
                activity.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)
                activity.requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},112);
        });
    }
    @JavascriptInterface public void notify(String json){
        activity.runOnUiThread(()->{
            if(!trusted()||json==null||json.length()>1600)return;
            try{
                JSONObject x=new JSONObject(json);
                String id=x.optString("id",""),title=x.optString("title","FLYXJ update"),
                    body=x.optString("body","New activity"),url=x.optString("url","/"),at=x.optString("at","");
                if(!id.matches("[a-zA-Z0-9:_-]{1,180}")||!url.matches("/(?:order/[1-9][0-9]{0,8}|chat)"))
                    return;
                String username=activity.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("activeUser","");
                if(username.isEmpty())return;
                send(activity,username,id,title,body,url,at);
            }catch(Exception ignored){}
        });
    }
    static void ensureChannel(Context ctx){
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager m=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if(m!=null){
                NotificationChannel c=new NotificationChannel(CHANNEL,"FLYXJ orders & messages",
                    NotificationManager.IMPORTANCE_HIGH);
                c.setDescription("Incoming customer orders, chat messages and shipment updates");
                c.enableVibration(true);m.createNotificationChannel(c);
            }
        }
    }
    static void send(Context ctx,String user,String id,String title,String body,String path,String at){
        if(Build.VERSION.SDK_INT>=33&&ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=PackageManager.PERMISSION_GRANTED)return;
        SharedPreferences prefs=ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        if(!user.equals(prefs.getString("activeUser","")))return;
        Set<String> seen=new HashSet<>(prefs.getStringSet("seen:"+user,new HashSet<>()));
        if(seen.contains(id))return;
        // Persist before notifying to suppress duplicate SSE + background job alerts.
        seen.add(id);if(seen.size()>150){seen.clear();seen.add(id);}
        prefs.edit().putStringSet("seen:"+user,seen).apply();
        Intent open=new Intent(ctx,MainActivity.class);
        open.putExtra("FLYXJ_OPEN_PATH",path);
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int key=(user+id).hashCode()&0x7fffffff;
        PendingIntent tap=PendingIntent.getActivity(ctx,key,open,
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?
            new Notification.Builder(ctx,CHANNEL):new Notification.Builder(ctx);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title.length()>80?title.substring(0,80):title)
            .setContentText(body.length()>130?body.substring(0,130):body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true).setContentIntent(tap)
            .setPriority(Notification.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL);
        NotificationManager manager=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager!=null)manager.notify(key,b.build());
    }
}
