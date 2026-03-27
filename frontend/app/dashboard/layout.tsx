import { Navbar } from '@/components/Navbar';

/** Shared layout for all authenticated app pages (dashboard, meetings, etc.) */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}
