import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ role, children }) => {
  const [user, setUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        setCurrentRole(docSnap.data()?.role);
      } else {
        setUser(null);
        setCurrentRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe(); // cleanup on unmount
  }, []);

  if (loading) return <p className="text-center mt-10">Loading...</p>;

  if (!user) return <Navigate to="/login" />;

  if (currentRole !== role) {
    // Redirect them to their actual dashboard
    return <Navigate to={`/${currentRole}-dashboard`} replace />;
  }

  return children;
};

export default ProtectedRoute;
