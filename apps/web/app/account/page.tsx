import type { Metadata } from 'next';

import './account.css';
import { AccountConsole } from './account-console';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Create, migrate and compete with your persistent Onbae actors.',
};

export default function AccountPage() {
  return <AccountConsole />;
}
