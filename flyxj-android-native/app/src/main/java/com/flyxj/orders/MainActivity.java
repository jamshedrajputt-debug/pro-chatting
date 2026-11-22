package com.flyxj.orders;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

/** FlyXJ order app: secure server WebView, file chooser and Android Back support. */
public class MainActivity extends Activity {
    private static final String DEFAULT_SERVER="https://flyxj-order-manager-free.onrender.com";
    private static final String KEY_SERVER="server_url";
    private static final int PICK_FILE=950;
    private WebView web;
    private android.webkit.ValueCallback<Uri[]> pending;
    private String server;

    @Override public void onCreate(Bundle savedInstanceState){
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(20,37,67));
        server=getPreferences(MODE_PRIVATE).getString(KEY_SERVER,DEFAULT_SERVER);
        createBrowser();
        if(savedInstanceState!=null && web.restoreState(savedInstanceState)!=null)return;
        web.loadUrl(server);
    }

    private boolean allowed(Uri url){
        if(url==null || server==null)return false;
        Uri base=Uri.parse(server);
        return "https".equalsIgnoreCase(url.getScheme()) &&
               base.getHost()!=null && base.getHost().equalsIgnoreCase(url.getHost()) &&
               base.getPort()==url.getPort();
    }

    private void createBrowser(){
        web=new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setSupportMultipleWindows(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setDefaultTextEncodingName("UTF-8");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);

        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri url=request.getUrl();
                if(allowed(url))return false;
                if("https".equalsIgnoreCase(url.getScheme())){
                    try {startActivity(new Intent(Intent.ACTION_VIEW,url));}
                    catch(ActivityNotFoundException ignored){Toast.makeText(MainActivity.this,"Cannot open link",Toast.LENGTH_SHORT).show();}
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,
                 android.webkit.ValueCallback<Uri[]> callback,FileChooserParams params){
                if(pending!=null)pending.onReceiveValue(null);
                pending=callback;
                try{
                    Intent intent=params.createIntent();
                    startActivityForResult(intent,PICK_FILE);
                    return true;
                }catch(Exception error){
                    pending=null;
                    Toast.makeText(MainActivity.this,"Could not open the file picker",Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });
        web.setDownloadListener((url,userAgent,disposition,mime,length)->{
            try{
                Uri uri=Uri.parse(url);
                if(!allowed(uri)){
                    if("https".equalsIgnoreCase(uri.getScheme()))
                        startActivity(new Intent(Intent.ACTION_VIEW,uri));
                    return;
                }
                String filename=URLUtil.guessFileName(url,disposition,mime);
                if(filename==null||filename.isEmpty())filename="FLYXJ-document.pdf";
                filename=filename.replaceAll("[^A-Za-z0-9._-]","_");
                DownloadManager.Request req=new DownloadManager.Request(uri);
                req.setTitle(filename);
                req.setDescription("FlyXJ order attachment");
                req.setMimeType(mime!=null?mime:"application/octet-stream");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String cookie=CookieManager.getInstance().getCookie(url);
                if(cookie!=null)req.addRequestHeader("Cookie",cookie);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,filename);
                DownloadManager manager=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(req);
                Toast.makeText(this,"Download started — check Downloads",Toast.LENGTH_LONG).show();
            }catch(Exception e){
                Toast.makeText(this,"Could not download. Open FlyXJ in Chrome to download this file.",Toast.LENGTH_LONG).show();
            }
        });
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);
    }

    @Override protected void onActivityResult(int code,int result,Intent data){
        super.onActivityResult(code,result,data);
        if(code==PICK_FILE && pending!=null){
            pending.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));
            pending=null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state){
        if(web!=null)web.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override public void onBackPressed(){
        if(web==null){super.onBackPressed();return;}
        // Ask the web UI to dismiss an open photo/drawer before navigating.
        // If nothing is open, go back through WebView history (e.g. order -> orders).
        String script="(function(){try{" +
          "if(typeof window.flyxjHandleBack==='function' && window.flyxjHandleBack())return true;" +
          "var viewer=document.getElementById('viewer');" +
          "if(viewer && !viewer.classList.contains('hidden')){" +
          "var close=document.getElementById('viewerClose');if(close)close.click();return true;}" +
          "var overlay=document.getElementById('overlay');" +
          "if(overlay && !overlay.classList.contains('hidden')){" +
          "var button=document.querySelector('.drawer:not(.hidden) [data-close]');" +
          "if(button){button.click();return true;}}" +
          "}catch(e){}return false;})()";
        web.evaluateJavascript(script,value->{
            if("true".equals(value))return;
            if(web!=null&&web.canGoBack())web.goBack();
            else confirmExit();
        });
    }

    private void confirmExit(){
        new AlertDialog.Builder(this)
          .setTitle("FlyXJ Order Manager")
          .setMessage("You are at the main dashboard.")
          .setPositiveButton("Stay in app",(d,w)->{})
          .setNeutralButton("Reload",(d,w)->{if(web!=null)web.reload();})
          .setNegativeButton("Exit app",(d,w)->finish())
          .show();
    }

    @Override protected void onDestroy(){
        if(pending!=null){pending.onReceiveValue(null);pending=null;}
        if(web!=null){web.destroy();web=null;}
        super.onDestroy();
    }
}