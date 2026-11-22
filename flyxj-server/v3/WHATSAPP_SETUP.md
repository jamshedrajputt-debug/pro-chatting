# FlyXJ — WhatsApp Business automatic new-order alerts

**Recipient:** +971 56 752 7192 (User B). User A has **no** WhatsApp Forward action, no WhatsApp URL in their order-create response, and the WhatsApp API rejects their authenticated request with HTTP 403.

## What's live after this change

- User A can submit and edit orders but cannot initiate WhatsApp forwarding in FlyXJ.
- User B has WhatsApp Forward in the order action menu and the order sheet.
- On a successful new order, FlyXJ automatically tries a Meta WhatsApp **approved template** to User B **only if** the following Render secrets are configured and valid.
- No custom sender credentials, approved template or Meta delivery verification are currently documented as available. Without them, auto-send is **not connected** and no messages are actually sent.

## Connect the sender in Meta WhatsApp Business Platform

Create or connect a Meta WhatsApp Business Account with an authorized sending phone number. Obtain a permanent supported access token, **Phone Number ID** for the sender (not the UAE destination number), and approved new-order message template. The recipient must meet WhatsApp messaging/opt-in requirements. Template category and charges are controlled by Meta.

Set these Render service environment variables through a secure environment/settings interface (never commit values to GitHub):

- `WHATSAPP_CLOUD_ACCESS_TOKEN` — WhatsApp Business Cloud API access token.
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID` — authorized **sender** phone number ID.
- `WHATSAPP_APPROVED_TEMPLATE` — approved Meta template name (lowercase letters, numbers and underscores).
- `WHATSAPP_GRAPH_VERSION` — optional, defaults to `v23.0`.

The body template must expect **five text placeholders, in order**: order reference, product title, size, colour and private FlyXJ order-page URL. The staff member must sign in to FlyXJ to access the original PDF and individual photos. Avoid displaying private customer data in public previews.

## Important: media delivery

The automatic notification currently sends a **template notification with a private order link**, not the raw PDF or individual image files as WhatsApp media attachments. Direct automatic sending of photos and PDFs requires compatible Meta-approved media template(s), uploaded media IDs, and appropriate messaging permissions/conversation windows; this has **not** been configured or verified yet.

## How to verify

Check Render logs for `User B WhatsApp Business automation: configured` versus `not connected`. The configured indicator only confirms environment variables exist; it **does not prove delivery**. Check the Meta WhatsApp Manager, API responses and delivery status webhooks for actual delivered messages.

The new order must always be saved in Supabase regardless of WhatsApp API availability.
