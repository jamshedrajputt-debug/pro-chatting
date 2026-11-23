package com.flyxj.orders;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER = 100;
    private static final int STORAGE_PERMISSION = 101;
    private static final String HOME = "file:///android_asset/start.html";
    private WebView webView;
    private android.webkit.ValueCallback<Uri[]> fileCallback;
    private String[] pendingDownload;
    private UpdateManager updateManager;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        webView.setLayoutParams(new ViewGroup.LayoutParams(-1,-1));
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // Explicit version marker lets the hosted dashboard avoid repeating old update prompts.
        settings.setUserAgentString(settings.getUserAgentString()+" FlyXJAndroid/6");
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView,true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                    android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback!=null) fileCallback.onReceiveValue(null);
                fileCallback=callback;
                try { startActivityForResult(params.createIntent(),FILE_CHOOSER);return true; }
                catch(ActivityNotFoundException e){
                    fileCallback=null;
                    Toast.makeText(MainActivity.this,"File chooser unavailable",Toast.LENGTH_LONG).show();
                    return false;
                }
            }
            @Override public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, android.os.Message resultMsg) {
                // Links with target=_blank should open in the same WebView so the
                // DownloadListener gets the HTTPS attachment request.
                WebView.HitTestResult hit = view.getHitTestResult();
                if (hit!=null && hit.getExtra()!=null) {
                    String target=hit.getExtra();
                    if(target.startsWith("https://")) {
                        view.loadUrl(target);
                        return false;
                    }
                }
                return false;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                String scheme=uri.getScheme();
                if("https".equalsIgnoreCase(scheme)) return false;
                if("http".equalsIgnoreCase(scheme)) {
                    Toast.makeText(MainActivity.this,"Only HTTPS links allowed",Toast.LENGTH_SHORT).show();
                    return true;
                }
                if("intent".equalsIgnoreCase(scheme)) {
                    try {
                        Intent intent=Intent.parseUri(uri.toString(),Intent.URI_INTENT_SCHEME);
                        try{startActivity(intent);}
                        catch(ActivityNotFoundException e) {
                            String fallback=intent.getStringExtra("browser_fallback_url");
                            if(fallback!=null && fallback.startsWith("https://")) view.loadUrl(fallback);
                            else Toast.makeText(MainActivity.this,"Browser unavailable",Toast.LENGTH_LONG).show();
                        }
                    }catch(Exception e){
                        Toast.makeText(MainActivity.this,"Cannot open link",Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                if("file".equalsIgnoreCase(scheme)||"about".equalsIgnoreCase(scheme)) return false;
                try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}
                catch(ActivityNotFoundException e){
                    Toast.makeText(MainActivity.this,"No app can open this link",Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        webView.setDownloadListener(new DownloadListener(){
            @Override public void onDownloadStart(String url,String userAgent,
                String contentDisposition,String mimeType,long contentLength){
                download(url,userAgent,contentDisposition,mimeType);
            }
        });
        if(savedInstanceState!=null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(HOME);
        updateManager = new UpdateManager(this);
        updateManager.check();
    }

    private void download(String url,String agent,String disposition,String mime){
        if(Build.VERSION.SDK_INT<=28
          &&checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED){
            pendingDownload=new String[]{url,agent,disposition,mime};
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},STORAGE_PERMISSION);
            return;
        }
        try {
            Uri uri=Uri.parse(url);
            if(!"https".equalsIgnoreCase(uri.getScheme())){
                Toast.makeText(this,"Only secure HTTPS downloads allowed",Toast.LENGTH_LONG).show();
                return;
            }
            String name=URLUtil.guessFileName(url,disposition,mime);
            name=name.replaceAll("[^a-zA-Z0-9._-]","_");
            if(name.isEmpty()) name="FlyXJ-download";
            DownloadManager.Request req=new DownloadManager.Request(uri);
            req.setTitle(name);
            req.setDescription("FlyXJ order file");
            if(mime!=null&&!mime.isEmpty())req.setMimeType(mime);
            if(agent!=null)req.addRequestHeader("User-Agent",agent);
            String cookies=CookieManager.getInstance().getCookie(url);
            if(cookies!=null&&!cookies.isEmpty())req.addRequestHeader("Cookie",cookies);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,name);
            DownloadManager manager=(DownloadManager)getSystemService(Context.DOWNLOAD_SERVICE);
            if(manager==null)throw new IllegalStateException("Download Manager unavailable");
            manager.enqueue(req);
            Toast.makeText(this,"Downloading: "+name,Toast.LENGTH_LONG).show();
        }catch(Exception e){
            Toast.makeText(this,"Download error: "+e.getMessage(),Toast.LENGTH_LONG).show();
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==STORAGE_PERMISSION&&pendingDownload!=null){
            String[] args=pendingDownload;pendingDownload=null;
            if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)
                download(args[0],args[1],args[2],args[3]);
            else Toast.makeText(this,"Storage permission required",Toast.LENGTH_LONG).show();
        }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==FILE_CHOOSER&&fileCallback!=null){
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));
            fileCallback=null;
        }
    }
    @Override protected void onResume(){
        super.onResume();
        if(updateManager!=null)updateManager.onResume();
    }
    @Override protected void onSaveInstanceState(Bundle outState){
        webView.saveState(outState);super.onSaveInstanceState(outState);
    }
    @Override public void onBackPressed(){
        if(webView!=null&&webView.canGoBack())webView.goBack();
        else super.onBackPressed();
    }
}
