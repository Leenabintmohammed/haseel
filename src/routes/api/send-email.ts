import { createAPIFileRoute } from '@tanstack/start/api'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const Route = createAPIFileRoute('/api/send-email')({
  POST: async ({ request }) => {
    try {
      const body = await request.json()
      const { email } = body

      const data = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'Verify your account - Haseel',
        html: `<p>Welcome to Haseel! Click here to verify your account: <a href="https://gohaseel.vercel.app">Verify Account</a></p>`,
      })

      return new Response(JSON.stringify(data), { status: 200 })
    } catch (error) {
      return new Response(JSON.stringify({ error }), { status: 500 })
    }
  },
})
