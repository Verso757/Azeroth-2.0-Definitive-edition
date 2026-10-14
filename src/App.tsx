/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Layout from './components/Layout';
import AuthPage from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Issues from './pages/Issues';
import NewIssue from './pages/NewIssue';
import AdminPanel from './pages/AdminPanel';
import Exchanges from './pages/Exchanges';
import NewExchange from './pages/NewExchange';
import Responsivas from './pages/Responsivas';
import Assets from './pages/Assets';
import NewAsset from './pages/NewAsset';
import AssignAsset from './pages/AssignAsset';
import AssetHistory from './pages/AssetHistory';

import Reports from './pages/Reports';
import QuickReport from './pages/QuickReport';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  return profile ? <>{children}</> : <Navigate to="/auth" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? <>{children}</> : <Navigate to="/" />;
}

export default function App() {
  // Render routing structure
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/quick-report" element={<QuickReport />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="issues" element={<Issues />} />
            <Route path="new-issue" element={<NewIssue />} />
            <Route path="exchanges" element={<Exchanges />} />
            <Route path="new-exchange" element={<NewExchange />} />
            <Route path="responsivas" element={<Responsivas />} />
            <Route path="assets" element={<Assets />} />
            <Route path="new-asset" element={<NewAsset />} />
            <Route path="assign-asset/:id" element={<AssignAsset />} />
            <Route path="asset-history/:id" element={<AssetHistory />} />
            <Route path="reports" element={<Reports />} />
            <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
