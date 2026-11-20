import Link from "next/link";
import { CalendarCheck, Radio, Stethoscope, BarChart3 } from "lucide-react";
const features = [
  { icon: CalendarCheck, t: "Book in four taps", d: "Choose a clinic, doctor and time. Get a confirmation straight away." },
  { icon: Radio, t: "Watch your token move", d: "See who is being served and how many patients are ahead of you." },
  { icon: Stethoscope, t: "Doctors call the next patient", d: "One button updates every screen in the clinic." },
  { icon: BarChart3, t: "Admins see the whole day", d: "Waiting times, no-shows and doctor workload in one place." },
];
export default function Landing() {
  return (
    <div>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-xl font-extrabold text-teal">Qurely</span>
        <Link href="/login" className="btn-ghost">Log in</Link>
      </nav>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Healthcare without the waiting chaos.</h1>
          <p className="mt-4 max-w-md text-lg text-ink/70">Book appointments, join digital queues, and track your waiting time in real time with Qurely.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary">Book an appointment</Link>
            <Link href="/login" className="btn-ghost">Join a queue</Link>
          </div>
        </div>
        <div className="card shadow-xl">
          <p className="text-sm text-ink/60">Sunrise Family Clinic · Dr. Rohan Mehta</p>
          <div className="mt-3 flex items-end gap-6">
            <div><p className="text-xs text-ink/60">Your token</p><p className="text-6xl font-extrabold text-amber-token">107</p></div>
            <div><p className="text-xs text-ink/60">Now serving</p><p className="text-3xl font-bold text-teal">102</p></div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-ink/10"><div className="h-2 w-1/4 rounded-full bg-teal" /></div>
          <p className="mt-2 text-sm">5 patients ahead · about 40 minutes</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: I, t, d }) => (
          <div key={t} className="card"><I className="text-teal" /><h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm text-ink/70">{d}</p></div>
        ))}
      </section>
      <footer className="border-t border-ink/10 py-6 text-center text-sm text-ink/60">Qurely · Your care. Your queue. Your time.</footer>
    </div>
  );
}
