import { createAPIFileRoute } from '@tanstack/start/api';
import { createClient } from '@supabase/supabase-js';

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'haseel_verify_token_2026';

export const APIRoute = createAPIFileRoute('/api/whatsapp/webhook')({
  GET: ({ request }) => {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verified successfully!');
      return new Response(challenge, { status: 200 });
    } else {
      return new Response('Verification failed', { status: 403 });
    }
  },

  POST: async ({ request }) => {
    try {
      const body = await request.json();
      
      if (body.object === 'whatsapp_business_account' && body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'messages') {
                const message = change.value.messages?.[0];
                const from = message?.from; 
                const messageType = message?.type;
                
                if (message && from) {
                  const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                  );

                  await supabase.from('whatsapp_messages').insert({
                    phone_number: from,
                    message_type: messageType || 'text',
                    message_content: message.text?.body || JSON.stringify(message),
                    direction: 'incoming',
                    received_at: new Date(message.timestamp * 1000).toISOString(),
                  });

                  console.log(`📩 Received message from ${from}:`, message.text?.body);
                }
              }
            }
          }
        }
      }

      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error) {
      console.error('Webhook error:', error);
      return new Response('Error', { status: 500 });
    }
  },
});
