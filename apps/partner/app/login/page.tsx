import { Suspense } from 'react';
import LoginPageClient from './LoginPageClient';

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-partner-900 via-partner-700 to-indigo-800 text-white">
      Đang tải...
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}
