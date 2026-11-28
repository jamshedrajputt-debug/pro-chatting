package com.flyxj.orders;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** Read-only, permission-granted attachments for Android's native share sheet. */
public final class ShareFileProvider extends ContentProvider {
    public static final String AUTHORITY = "com.flyxj.orders.downloadfix.share";

    private File locate(Uri uri) throws FileNotFoundException {
        if (uri == null || !AUTHORITY.equals(uri.getAuthority())) throw new FileNotFoundException("Invalid authority");
        if (uri.getPathSegments().size() != 2 || !"shared".equals(uri.getPathSegments().get(0)))
            throw new FileNotFoundException("Invalid share link");
        String filename = uri.getLastPathSegment();
        if (filename == null || !filename.matches("[a-zA-Z0-9_-]{8,64}\\.(png|pdf|jpg|webp)"))
            throw new FileNotFoundException("Invalid filename");
        File file = new File(new File(getContext().getCacheDir(), "shared"), filename);
        if (!file.isFile()) throw new FileNotFoundException("Attachment expired");
        return file;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) {
        try { String file=locate(uri).getName();
        if(file.endsWith(".pdf"))return "application/pdf";
        if(file.endsWith(".jpg"))return "image/jpeg";
        if(file.endsWith(".webp"))return "image/webp";
        return "image/png"; }
        catch (FileNotFoundException e) { return null; }
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
        return ParcelFileDescriptor.open(locate(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = locate(uri);
            String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
            MatrixCursor result = new MatrixCursor(columns);
            Object[] values = new Object[columns.length];
            for (int i = 0; i < columns.length; i++) {
                if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) values[i] = file.getName();
                else if (OpenableColumns.SIZE.equals(columns[i])) values[i] = file.length();
                else values[i] = null;
            }
            result.addRow(values);
            return result;
        } catch (FileNotFoundException e) { return null; }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
