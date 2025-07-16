import { useState } from 'react';
import { auth, db } from '../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const docRef = doc(db, 'users', userCredential.user.uid);
      const docSnap = await getDoc(docRef);
      const role = docSnap.data()?.role;
      navigate(`/${role}-dashboard`);
    } catch {
      alert('Invalid email or password');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-green-50 to-lime-100 flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl ring-1 ring-white/10 p-8 space-y-6"
      >
        <h2 className="text-3xl font-bold text-center text-emerald-900 drop-shadow">Welcome Back</h2>
        <p className="text-sm text-center text-emerald-700">Login to access your dashboard</p>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-emerald-900 mb-1">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="w-full px-4 py-2 bg-white/20 text-emerald-900 border border-white/20 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-emerald-900 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            className="w-full px-4 py-2 bg-white/20 text-emerald-900 border border-white/20 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold py-2 rounded-xl shadow-xl transition-all duration-200"
        >
          Sign In
        </button>

        <div className="text-center text-sm text-emerald-600">or</div>

        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="w-full bg-white/10 backdrop-blur-md text-emerald-800 font-semibold py-2 rounded-xl transition-all duration-200 border border-emerald-200 hover:bg-white/20 shadow-inner"
        >
          Create Account
        </button>
      </form>
    </div>
  );
}
