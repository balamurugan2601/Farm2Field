import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Signup from './pages/Signup';
import Login from './pages/Login';
import FarmerDashboard from './pages/FarmerDashboard';
import RetailerDashboard from './pages/RetailerDashboard';
import SupplierDashboard from './pages/SupplierDashboard';
import ProtectedRoute from './components/ProtectedRoute';
// import AssignShipment from './pages/AssignShipment'; // Optional

export default function App() {
  return (
    <>
      {/* ✅ Main App Routes */}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/signup" replace />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/farmer-dashboard"
            element={
              <ProtectedRoute role="farmer">
                <FarmerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/retailer-dashboard"
            element={
              <ProtectedRoute role="retailer">
                <RetailerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supplier-dashboard"
            element={
              <ProtectedRoute role="supplier">
                <SupplierDashboard />
              </ProtectedRoute>
            }
          />

          {/* Optional route for future */}
          {/* <Route path="/assign-shipment" element={<AssignShipment />} /> */}
        </Routes>
      </BrowserRouter>
    </>
  );
}
