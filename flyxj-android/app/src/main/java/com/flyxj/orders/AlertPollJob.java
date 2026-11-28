package com.flyxj.orders;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.net.URI;

/** Background notification fallback. Android schedules at roughly 15-min intervals;
 * this is not an instant Firebase/FCM push channel and may be delayed by Doze.
 */
public final class AlertPollJob extends JobService {
    private final Handler ui=new Handler(Looper.getMainLooper());
    private volatile boolean stopped=false;
    @Override public boolean onStartJob(JobParameters params){
        SharedPreferences prefs=getSharedPreferences(AlertBridge.PREFS,Context.MODE_PRIVATE);
        String user=prefs.getString("activeUser","");
        if(user.isEmpty()){jobFinished(params,false);return false;}
        // Cookie Manager is initialised by the same signed WebView application.
        final String cookie;
        try{cookie=CookieManager.getInstance().getCookie("https://"+AlertBridge.HOST+"/");}
        catch(Exception e){jobFinished(params,false);return false;}
        if(cookie==null||!cookie.contains("flyxj_session=")){jobFinished(params,false);return false;}
        stopped=false;
        new Thread(()->{
            HttpURLConnection connection=null;
            try{
                connection=(HttpURLConnection)new URL("https://"+AlertBridge.HOST+"/api/notifications").openConnection();
                connection.setConnectTimeout(70000);connection.setReadTimeout(70000);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Cookie",cookie);
                connection.setRequestProperty("Accept","application/json");
                connection.setRequestProperty("User-Agent","FlyXJ-Android-Notifications/9");
                if(connection.getResponseCode()!=200)return;
                StringBuilder body=new StringBuilder();
                try(BufferedReader r=new BufferedReader(new InputStreamReader(connection.getInputStream(),"UTF-8"))){
                    String line;while((line=r.readLine())!=null){
                        body.append(line);if(body.length()>100000)throw new Exception("Oversize feed");
                    }
                }
                JSONObject result=new JSONObject(body.toString());
                if(!user.equals(result.optString("account","")))return;
                JSONArray feed=result.optJSONArray("notifications");
                if(feed==null)return;
                SharedPreferences saved=getSharedPreferences(AlertBridge.PREFS,Context.MODE_PRIVATE);
                String baseline=saved.getString("baseline:"+user,"");
                String last=saved.getString("last:"+user,baseline);
                String latest=last;
                ArrayList<JSONObject> newEvents=new ArrayList<>();
                for(int i=0;i<feed.length();i++){
                    JSONObject entry=feed.optJSONObject(i);if(entry==null)continue;
                    String at=entry.optString("at",""),id=entry.optString("id","");
                    if(!at.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T.*")||
                       !id.matches("[a-zA-Z0-9:_-]{1,180}"))continue;
                    if(at.compareTo(latest)>0)latest=at;
                    if(at.compareTo(last)>0)newEvents.add(entry);
                }
                if(stopped||!user.equals(saved.getString("activeUser","")))return;
                // Walk oldest to newest and avoid native push duplicates.
                for(int i=newEvents.size()-1;i>=0;i--){
                    JSONObject item=newEvents.get(i);
                    String url=item.optString("url","/"),id=item.optString("id","");
                    if(!url.matches("/(?:order/[1-9][0-9]{0,8}|chat)"))continue;
                    AlertBridge.send(this,user,id,item.optString("title","FLYXJ update"),
                      item.optString("body","New order activity"),url,item.optString("at",""));
                }
                if(latest.compareTo(last)>0)saved.edit().putString("last:"+user,latest).apply();
            }catch(Exception ignored){
                // No network, expired session or offline? Next scheduled check retries.
            }finally{
                if(connection!=null)connection.disconnect();
                ui.post(()->jobFinished(params,false));
            }
        },"FLYXJ-alert-poll").start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params){stopped=true;return true;}
}
