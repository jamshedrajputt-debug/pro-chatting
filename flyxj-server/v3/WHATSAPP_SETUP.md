# FlyXJ — User B WhatsApp Direct PDF + Photo Messages

## Expected live behavior

On each successful **new User A order**, if Meta credentials and media templates are configured, the server automatically sends **six independent WhatsApp media messages** to the one permitted recipient:

**+971 56 752 7192** (E.164 recipient `971567527192`).

1. Original PDF, as a **document attachment**.
2. One **combined JPEG image** with the first four product photos in a 2×2 grid and **Size / Color printed into the pixels**.
3. Reference Photo 1, as a native JPEG image.
4. Reference Photo 2, as a native JPEG image.
5. Reference Photo 3, as a native JPEG image.
6. Reference Photo 4, as a native JPEG image.

For fewer than four uploaded photos, the server sends only available photos plus the combined collage (empty collage slots stay white). For uploads of more than four photos, the first four reference photos are sent separately. **No file URLs or external links are sent to WhatsApp.** The server privately reads the source files from FlyXJ/Supabase and uploads them to Meta's WhatsApp Media API first; each approved message uses a Meta media ID.

The backend records each message accepted by Meta in private Supabase state so retries do not knowingly re-send accepted files. **"Accepted by Meta" does not confirm delivered to the device**; delivery confirmation requires WhatsApp webhooks. User A cannot invoke the sending API, cannot open a WhatsApp draft from FlyXJ, and cannot access the staff media status. User B can retry a failed batch from **Send PDF + Photos**.

## Essential Meta WhatsApp Business setup (requires account owner)

You need a WhatsApp Business Account (WABA), an approved authorized sender phone, a long-lived/system-user access token with permissions, and opt-in for the recipient. Meta may charge fees for outbound template messages, especially six template messages per order.

Create **two distinct Utility media templates** and wait for Meta to approve both:

**Image-header template**, example name `flyxj_photo_media`:
- Header: **IMAGE** (dynamic media image).
- Body: `Order {{1}} — {{2}}. Size: {{3}}. Color: {{4}}.`
- Language: `en`.

**Document-header template**, example name `flyxj_pdf_document`:
- Header: **DOCUMENT** (dynamic PDF document).
- Body: `Order {{1}} — {{2}}. Size: {{3}}. Color: {{4}}.`
- Language: `en`.

Both must match the exact **four** text body variables (order ref, title, size, color). The media header is an additional dynamic media parameter. Meta's approval is mandatory; the app cannot bypass it.

Set these **Render service environment variables** at `flyxj-order-manager-free` using secure Render settings (never paste tokens in GitHub/WhatsApp/chat):

```text
WHATSAPP_CLOUD_ACCESS_TOKEN=<long-lived Meta system-user token>
WHATSAPP_CLOUD_PHONE_NUMBER_ID=<authorized sending phone number ID>
WHATSAPP_MEDIA_IMAGE_TEMPLATE=flyxj_photo_media
WHATSAPP_MEDIA_DOCUMENT_TEMPLATE=flyxj_pdf_document
WHATSAPP_TEMPLATE_LANGUAGE=en
WHATSAPP_GRAPH_VERSION=v23.0
```

These are **Meta sender** credentials, not the recipient mobile number. Once configured and valid, new orders automatically queue media. To inspect, check Render log `User B WhatsApp Direct Media: configured`; this checks settings only and **does not prove message delivery or template approval**. The recipient must be able to receive template messages and satisfy Meta's messaging rules.

**When NOT configured:** orders still save securely in Supabase, but automatic WhatsApp transfer does not run. User B's manual file action returns a clear setup requirement. No insecure wa.me links or PDF/photo URLs are sent as an alternative.

## Failure recovery and safety

- Attachments are read from private Supabase storage only on the server.
- A transfer sends one document plus five image messages. If Meta accepts some then fails, staff can retry the rest using the order actions menu.
- The Supabase order persists per-file accepted message IDs to avoid intentional duplicates. Rare network failures between Meta accepting a message and saving its ID may require manual review before retrying.
- This release does not include Meta delivery webhooks; sender-side API acknowledgements are not proof of delivery.
- An order with one photo generates one reference-photo media message and one collage. For exactly 4 uploaded pictures it sends all six requested files.

Meta official references: WhatsApp Business Platform Media API, media-based message templates, approved business-initiated templates.
