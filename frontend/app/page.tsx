import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { Bot, FileText, Zap, ArrowRight, Github } from 'lucide-react';

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-8 border border-brand-100">
          <Zap size={12} />
          AI-Powered Meeting Attendance
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-gray-900 mb-6 leading-tight">
          Let AI attend your
          <br />
          <span className="text-brand-600">Zoom meetings</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Full transcript, smart notes, and key screenshots delivered automatically —
          while you focus on what matters.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <SignedIn>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 transition-colors shadow-sm"
            >
              Go to Dashboard <ArrowRight size={16} />
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="inline-flex items-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8 py-3.5 transition-colors shadow-sm">
                Get started free <ArrowRight size={16} />
              </button>
            </SignInButton>
          </SignedOut>
          <a
            href="https://github.com/SAR0406/AttendAi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-3.5 transition-colors"
          >
            <Github size={16} />
            View on GitHub
          </a>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              icon: <Bot size={22} className="text-brand-600" />,
              title: 'AI Bot Attendance',
              desc: 'Our bot joins in your place, announces itself to comply with recording laws, and stays for the full session.',
            },
            {
              icon: <FileText size={22} className="text-brand-600" />,
              title: 'Live Transcript',
              desc: 'Diarized, speaker-labelled transcript — streaming in real time. Supports Deepgram Nova-3 and NVIDIA Riva.',
            },
            {
              icon: <Zap size={22} className="text-brand-600" />,
              title: 'Smart Notes',
              desc: 'AI extracts action items, decisions, key points, and open questions — no fluff, just signal.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-4 pb-24">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Simple pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { plan: 'Free', price: '$0/mo', limits: '5 meetings · 30-min cap', highlight: false },
            { plan: 'Pro', price: '$15/mo', limits: 'Unlimited · 4-hr cap', highlight: true },
            { plan: 'Team', price: '$12/seat/mo', limits: 'All Pro + CRM export', highlight: false },
            { plan: 'Enterprise', price: 'Custom', limits: 'SSO · Custom retention · API', highlight: false },
          ].map((p) => (
            <div
              key={p.plan}
              className={`rounded-2xl border p-5 ${
                p.highlight
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {p.highlight && (
                <span className="inline-block text-xs font-semibold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full mb-3">
                  Most popular
                </span>
              )}
              <p className="font-bold text-lg text-gray-900">{p.plan}</p>
              <p className="text-2xl font-extrabold text-brand-600 my-1">{p.price}</p>
              <p className="text-xs text-gray-500">{p.limits}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
