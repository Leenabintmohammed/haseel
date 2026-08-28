import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'haseel_verify_token_2026';

  // GET request = webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verified successfully!');
      res.status(200).send(challenge);
      return;
    } else {
      res.status(403).send('Verification failed');
      return;
    }
  }

  // POST request = receive messages
  if (req.method === 'POST') {
    const body = req.body;
    
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

                // Save message to database
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

    res.status(200).send('EVENT_RECEIVED');
    return;
  }

  res.status(405).send('Method not allowed');
}
