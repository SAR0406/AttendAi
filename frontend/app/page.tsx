import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Logo / brand */}
        <div className="space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight text-brand-600">
            AttendAi
          </h1>
          <p className="text-xl text-gray-500">
            Let AI attend your Zoom meetings — full transcript, smart notes, and key
            screenshots delivered automatically.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          {[
            {
              icon: '🤖',
              title: 'AI Bot Attendance',
              desc: 'Our bot joins in your place, announces itself to comply with recording laws, and stays for the full session.',
            },
            {
              icon: '📝',
              title: 'Live Transcript',
              desc: 'Diarized, speaker-labelled transcript — streaming in real time to your dashboard. Supports Deepgram Nova-3 and NVIDIA Riva whisper-large-v3.',
            },
            {
              icon: '✨',
              title: 'Smart Notes',
              desc: 'Claude Sonnet extracts action items, decisions, key points, and open questions — no fluff.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3 transition-colors"
          >
            Go to Dashboard
          </Link>
          <a
            href="https://github.com/SAR0406/AttendAi"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-3 transition-colors"
          >
            View on GitHub
          </a>
        </div>

        {/* Pricing */}
        <div className="pt-8">
          <h2 className="text-2xl font-bold mb-6">Simple pricing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-left">
            {[
              { plan: 'Free', price: '$0/mo', limits: '5 meetings · 30-min cap', highlight: false },
              { plan: 'Pro', price: '$15/mo', limits: 'Unlimited · 4-hr cap', highlight: true },
              { plan: 'Team', price: '$12/seat/mo', limits: 'All features + CRM export', highlight: false },
              { plan: 'Enterprise', price: 'Custom', limits: 'SSO · Custom retention · API', highlight: false },
            ].map((p) => (
              <div
                key={p.plan}
                className={`rounded-2xl border p-5 ${
                  p.highlight
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className="font-bold text-lg">{p.plan}</p>
                <p className="text-2xl font-extrabold text-brand-600 my-1">{p.price}</p>
                <p className="text-xs text-gray-500">{p.limits}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
