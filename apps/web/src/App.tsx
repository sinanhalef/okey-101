import { Navigate, Route, Routes } from 'react-router-dom';
import { t } from '@okey101/shared';
import { useAuth } from './hooks/useAuth';
import { Menu } from './screens/Menu';
import { CreateTable } from './screens/CreateTable';
import { TableScreen } from './screens/TableScreen';
import { ToastProvider } from './components/Toast';

export function App() {
  const { user, ready } = useAuth();
  if (!ready || !user) return <div className="page"><div className="column muted">{t('common.loading')}</div></div>;
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Menu user={user} />} />
        <Route path="/create" element={<CreateTable user={user} />} />
        <Route path="/t/:id" element={<TableScreen user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
