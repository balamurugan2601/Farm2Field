import { useState } from 'react';
import { auth, db } from '../services/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('farmer');
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', userCredential.user.uid), { role, name });
      navigate(`/${role}-dashboard`);
    } catch {
      alert('Signup failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-green-50 to-lime-100 flex items-center justify-center px-4 font-sans">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl ring-1 ring-white/10 p-8 space-y-6"
      >
        <h2 className="text-3xl font-bold text-center text-emerald-900 drop-shadow">Create Your Account</h2>
        <p className="text-sm text-center text-emerald-700">Sign up to join as a stakeholder</p>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-emerald-900 mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Your Name"
            className="w-full px-4 py-2 bg-white/20 text-emerald-900 border border-white/20 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition"
            onChange={(e) => setName(e.target.value)}
            value={name}
            required
          />
        </div>

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
            placeholder="Create a password"
            className="w-full px-4 py-2 bg-white/20 text-emerald-900 border border-white/20 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-emerald-900 mb-1">
            Select Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-4 py-2 bg-white/20 text-emerald-900 border border-white/20 rounded-xl backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner transition"
          >
            <option value="farmer">👨‍🌾 Farmer</option>
            <option value="retailer">🏪 Retailer</option>
            <option value="supplier">🛍️ Supplier</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold py-2 rounded-xl shadow-xl transition-all duration-200"
        >
          Sign Up
        </button>

        <div className="text-center text-sm text-emerald-600">or</div>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="w-full bg-white/10 backdrop-blur-md text-emerald-800 font-semibold py-2 rounded-xl transition-all duration-200 border border-emerald-200 hover:bg-white/20 shadow-inner"
        >
          Already have an account? Login
        </button>
      </form>
    </div>
  );
}
