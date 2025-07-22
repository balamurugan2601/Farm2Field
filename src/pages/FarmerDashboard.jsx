import { useEffect, useState } from 'react';
import contract from '../services/contract';
import Web3 from 'web3';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import SensorSimulator from '../components/SensorSimulator';

export default function FarmerDashboard() {
  const [shipments, setShipments] = useState([]); // [{shipment, latestData, alerts}]
  const [orders, setOrders] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [user, setUser] = useState(null);
  // Add product form state and handlers
  const [form, setForm] = useState({ name: '', category: '', price: '', unit: '', quantity: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProductValue, setEditingProductValue] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [assigning, setAssigning] = useState({}); // {orderId: supplierId}
  const [sensorData, setSensorData] = useState({}); // {shipmentId: latestData}

  function handleFormChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    setFormMsg('');
    if (!user) return setFormMsg('Not logged in.');
    if (!form.name || !form.category || !form.price || !form.unit || !form.quantity) {
      setFormMsg('Please fill all fields.');
      return;
    }
    setFormLoading(true);
    try {
      await addDoc(collection(db, 'products'), {
        name: form.name,
        category: form.category,
        price: parseFloat(form.price),
        unit: form.unit,
        quantity: parseFloat(form.quantity),
        farmerId: user.uid,
        createdAt: new Date(),
      });
      setForm({ name: '', category: '', price: '', unit: '', quantity: '' });
      setFormMsg('✅ Product added!');
    } catch (err) {
      setFormMsg('❌ Error: ' + err.message);
    }
    setFormLoading(false);
  }
  // Remove product form state and handlers
  // Remove the product creation form section from the JSX

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Listen for orders for this farmer's products
    const q = query(collection(db, 'orders'), where('farmerId', '==', user.uid));
    const unsubOrders = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setOrders(list);
    });
    // Fetch suppliers for assignment
    const unsubSuppliers = onSnapshot(collection(db, 'users'), (snap) => {
      setSuppliers(snap.docs.filter((d) => d.data().role === 'supplier').map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubOrders(); unsubSuppliers(); };
  }, [user]);

  useEffect(() => {
    // Fetch farmer's products, then relevant shipments, then listen for sensor data
    let unsubList = [];
    if (!auth.currentUser) return;
    const farmerId = auth.currentUser.uid;
    // 1. Get farmer's products (fix: use farmerId)
    const productsQuery = query(
      collection(db, 'products'),
      where('farmerId', '==', farmerId)
    );
    const unsubProducts = onSnapshot(productsQuery, (productsSnapshot) => {
      const farmerProducts = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const farmerProductIds = farmerProducts.map((p) => p.id);
      // 2. Get all shipments for these products
      if (farmerProductIds.length === 0) {
        setShipments([]);
        setProductMap({});
        return;
      }
      // 4. Create product map for display
      const pMap = {};
      farmerProducts.forEach((p) => {
        pMap[p.id] = p;
      });
      setProductMap(pMap);
      // 3. Listen for latest sensor data for each shipment
      // (Optional: you may want to refactor this to avoid duplicate listeners)
    });
    unsubList.push(unsubProducts);
    return () => { unsubList.forEach((u) => u()); };
  }, [user]);

  // Listen for latest sensor data for each shipment every 3 seconds
  useEffect(() => {
    if (!shipments.length) return;
    const interval = setInterval(async () => {
      const newSensorData = {};
      for (const s of shipments) {
        const shipment = s.shipment || s; // handle both {shipment, ...} and shipment object
        const q = query(collection(db, 'shipments', shipment.id, 'sensorData'), orderBy('timestamp', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          newSensorData[shipment.id] = snap.docs[0].data();
        }
      }
      setSensorData(newSensorData);
    }, 3000);
    return () => clearInterval(interval);
  }, [shipments]);

  async function triggerPayment() {
    if (!window.ethereum) {
      alert('MetaMask not detected!');
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      const sender = accounts[0];
      const tx = await contract.methods.pay().send({
        from: sender,
        value: Web3.utils.toWei('0.01', 'ether'),
      });
      console.log('Transaction success:', tx);
      alert('✅ Payment successfully triggered on blockchain');
    } catch (err) {
      console.error('Payment error:', err);
      alert('❌ Payment failed or rejected');
    }
  }

  // Remove product form handlers
  // Remove handleAddProduct function

  // Assign shipment handler
  const handleAssignShipment = async (order) => {
    const supplierId = assigning[order.id];
    if (!supplierId) return alert('Select a supplier');
    try {
      // 1. Create shipment
      await addDoc(collection(db, 'shipments'), {
        supplierId,
        productId: order.productId,
        retailerId: order.retailerId,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'orders', order.id), {
        supplierId,
        statusUpdatedAt: serverTimestamp(),
      });
      alert('Shipment assigned!');
    } catch (err) {
      alert('Failed to assign shipment: ' + (err?.message || err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-green-50 to-lime-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-4xl bg-white/10 backdrop-blur-lg rounded-3xl shadow-2xl ring-1 ring-white/10 p-10 space-y-10">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-emerald-900 mb-2 drop-shadow">🌾 Farmer Dashboard</h1>
          <p className="text-emerald-700">Real-time Monitoring & Alerts</p>
        </div>
        <SensorSimulator />
        {/* Live Sensor Data Block (copied from SupplierDashboard) */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">🚚 Live Sensor Data for Your Shipments</h2>
          {shipments.length === 0 ? (
            <p className="text-emerald-600 italic">No shipments assigned yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {shipments.map(({ shipment }) => (
                <div key={shipment.id} className="bg-white/20 p-4 rounded-xl shadow-inner border border-white/20">
                  {/* Start sensor simulation for assigned, pending, or in transit shipments only */}
                  {(shipment.status === 'assigned' || shipment.status === 'pending' || shipment.status === 'in transit') && <SensorSimulator shipmentId={shipment.id} />}
                  <div className="font-bold text-emerald-900 mb-2">Shipment ID: {shipment.id}</div>
                  <div className="text-emerald-800 mb-1">Product: {productMap[shipment.productId]?.name || shipment.productId}</div>
                  <div className="text-emerald-800 mb-1">Status: {shipment.status}</div>
                  <div className="text-emerald-800 mb-1">Supplier: {shipment.supplierId}</div>
                  <div className="text-emerald-800 mb-1">Retailer: {shipment.retailerId}</div>
                  {sensorData[shipment.id] ? (
                    <ul className="text-emerald-900 text-base mb-2">
                      <li>🌡 Temp: <b>{sensorData[shipment.id].temperature}</b> °C</li>
                      <li>💧 Humidity: <b>{sensorData[shipment.id].humidity}</b> %</li>
                      <li>🪫 Gas Level: <b>{sensorData[shipment.id].gasLevel}</b></li>
                      <li>⚖ Weight: <b>{sensorData[shipment.id].weight}</b> kg</li>
                      <li>📍 Location: <b>Lat {sensorData[shipment.id].location?.lat?.toFixed(4)}, Lng {sensorData[shipment.id].location?.lng?.toFixed(4)}</b></li>
                    </ul>
                  ) : (
                    <div className="text-emerald-600 italic">No sensor data yet.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Product Creation Form */}
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">➕ Add New Product</h2>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input name="name" value={form.name} onChange={handleFormChange} placeholder="Product Name" className="p-3 rounded-xl border border-white/20 bg-white/20 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500" required />
            <input name="category" value={form.category} onChange={handleFormChange} placeholder="Category (e.g. Wheat)" className="p-3 rounded-xl border border-white/20 bg-white/20 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500" required />
            <input name="price" type="number" min="0" value={form.price} onChange={handleFormChange} placeholder="Price per unit" className="p-3 rounded-xl border border-white/20 bg-white/20 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500" required />
            <input name="unit" value={form.unit} onChange={handleFormChange} placeholder="Unit (e.g. kg, ton)" className="p-3 rounded-xl border border-white/20 bg-white/20 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500" required />
            <input name="quantity" type="number" min="0" value={form.quantity} onChange={handleFormChange} placeholder="Quantity" className="p-3 rounded-xl border border-white/20 bg-white/20 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500" required />
            <button type="submit" className="col-span-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold py-3 rounded-xl shadow-xl transition-all duration-200 disabled:opacity-60" disabled={formLoading}>{formLoading ? 'Adding...' : 'Add Product'}</button>
          </form>
          {formMsg && <div className="mt-2 text-emerald-800 font-medium">{formMsg}</div>}
        </section>
        {/* Assign Shipments Section */}
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">Assign Shipments to Suppliers</h2>
          {orders.filter(o => o.status === 'paid' && !o.supplierId).length === 0 ? (
            <p className="text-emerald-600 italic">No paid orders awaiting shipment assignment.</p>
          ) : (
            <ul className="space-y-3">
              {orders.filter(o => o.status === 'paid' && !o.supplierId).map((o) => (
                <li key={o.id} className="bg-white/20 rounded-xl p-4 shadow-inner border border-white/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="font-bold text-emerald-900">{productMap[o.productId]?.name || o.productId}</div>
                    <div className="text-emerald-800">Quantity: {o.quantity}</div>
                    <div className="text-emerald-800">Retailer: {o.retailerId}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <select
                      className="p-2 rounded-xl border border-emerald-300"
                      value={assigning[o.id] || ''}
                      onChange={e => setAssigning(a => ({ ...a, [o.id]: e.target.value }))}
                    >
                      <option value="">-- Select Supplier --</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name || 'Unnamed Supplier'}
                        </option>
                      ))}
                    </select>
                    <button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow"
                      onClick={() => handleAssignShipment(o)}
                    >
                      Assign Shipment
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* Farmer's Products Section */}
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">Your Products</h2>
          {Object.values(productMap).length === 0 ? (
            <p className="text-emerald-600 italic">No products added yet.</p>
          ) : (
            <ul className="space-y-3">
              {Object.values(productMap).map((p) => (
                <li key={p.id} className="bg-white/20 rounded-xl p-4 shadow-inner border border-white/20 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-emerald-900">{p.name}</div>
                    <div className="text-emerald-800">Category: {p.category}</div>
                    <div className="text-emerald-800">Price: ₹{p.price} / {p.unit}</div>
                    <div className="text-emerald-800">Quantity: {editingProductId === p.id ? (
                      <input type="number" min="0" value={editingProductValue} onChange={e => setEditingProductValue(e.target.value)} className="w-24 border border-white/20 bg-white/20 text-emerald-900 rounded-lg px-2 py-1 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition" />
                    ) : (
                      p.quantity
                    )}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    {editingProductId === p.id ? (
                      <>
                        <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-3 rounded-lg shadow" onClick={async () => {
                          const newQty = parseFloat(editingProductValue);
                          if (isNaN(newQty) || newQty < 0) {
                            setFormMsg('❌ Enter a valid quantity');
                            return;
                          }
                          await updateDoc(doc(db, 'products', p.id), {
                            quantity: newQty,
                            updatedAt: new Date(),
                          });
                          setEditingProductId(null);
                          setEditingProductValue('');
                          setFormMsg('✅ Product quantity updated!');
                        }}>Save</button>
                        <button className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded-lg shadow" onClick={() => { setEditingProductId(null); setEditingProductValue(''); }}>Cancel</button>
                      </>
                    ) : (
                      <button className="bg-emerald-500 hover:bg-emerald-700 text-white font-bold py-1 px-3 rounded-lg shadow" onClick={() => { setEditingProductId(p.id); setEditingProductValue(p.quantity.toString()); }}>Edit</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* Orders Section */}
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">Orders for Your Products</h2>
          {orders.length === 0 ? (
            <p className="text-emerald-600 italic">No orders yet.</p>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="bg-white/20 rounded-xl p-4 shadow-inner border border-white/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="font-bold text-emerald-900">{productMap[o.productId]?.name || o.productId}</div>
                    <div className="text-emerald-800">Quantity: {o.quantity}</div>
                    <div className="text-emerald-800">Retailer: {o.retailerId}</div>
                    <div className="text-emerald-800">Status: {o.status}</div>
                    <div className="text-emerald-800">Payment: {o.status === 'paid' ? 'Paid' : 'Not Paid'}</div>
                    <div className="text-emerald-800">Supplier: {o.supplierId || 'Not assigned'}</div>
                  </div>
                  {o.status === 'paid' && !o.supplierId && (
                    <div className="flex flex-col gap-2">
                      <select
                        className="p-2 rounded-xl border border-emerald-300"
                        value={assigning[o.id] || ''}
                        onChange={e => setAssigning(a => ({ ...a, [o.id]: e.target.value }))}
                      >
                        <option value="">-- Select Supplier --</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                      </select>
                      <button
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow"
                        onClick={() => handleAssignShipment(o)}
                      >
                        Assign Shipment
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* Sensor Data Section */}
        <section className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">📊 Latest Sensor Data for Your Shipments</h2>
          {shipments.length === 0 ? (
            <p className="text-emerald-600 italic">No shipments or sensor data available.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {shipments.map(({ shipment, alerts }) => (
                <div key={shipment.id} className="bg-white/20 p-4 rounded-xl shadow-inner border border-white/20">
                  {/* Start sensor simulation for assigned, pending, or in transit shipments only */}
                  {(shipment.status === 'assigned' || shipment.status === 'pending' || shipment.status === 'in transit') && <SensorSimulator shipmentId={shipment.id} />}
                  <div className="font-bold text-emerald-900 mb-2">Shipment ID: {shipment.id}</div>
                  <div className="text-emerald-800 mb-1">Product: {productMap[shipment.productId]?.name || shipment.productId}</div>
                  <div className="text-emerald-800 mb-1">Status: {shipment.status}</div>
                  {shipment.status === 'delivered' && (
                    <>
                      <div className="text-emerald-700">Delivered at: {shipment.deliveredAt?.toDate?.().toLocaleString?.() || shipment.deliveredAt}</div>
                      <div className="text-emerald-700">Supplier: {shipment.supplierId}</div>
                      <div className="text-emerald-700">Retailer: {shipment.retailerId}</div>
                    </>
                  )}
                  {sensorData[shipment.id] ? (
                    <ul className="text-emerald-900 text-base mb-2">
                      <li>🌡 Temp: <b>{sensorData[shipment.id].temperature}</b> °C</li>
                      <li>💧 Humidity: <b>{sensorData[shipment.id].humidity}</b> %</li>
                      <li>🪫 Gas Level: <b>{sensorData[shipment.id].gasLevel}</b></li>
                      <li>⚖ Weight: <b>{sensorData[shipment.id].weight}</b> kg</li>
                      <li>📍 Location: <b>Lat {sensorData[shipment.id].location?.lat?.toFixed(4)}, Lng {sensorData[shipment.id].location?.lng?.toFixed(4)}</b></li>
                    </ul>
                  ) : (
                    <div className="text-emerald-600 italic">No sensor data yet.</div>
                  )}
                  <div>
                    <h3 className="font-semibold text-emerald-900">Alerts:</h3>
                    {alerts && alerts.length > 0 ? (
                      <ul className="space-y-1 text-emerald-800 font-medium">
                        {alerts.map((alert, idx) => (
                          <li key={idx} className="bg-white/30 px-3 py-1 rounded shadow-inner border-l-4 border-emerald-500">{alert}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-emerald-700 font-semibold">✅ No alerts. Everything is normal!</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        {/* Market Demand Section */}
        <section className="mt-10 bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-2 text-emerald-900">📊 Market Demand:</h2>
          {orders.length === 0 ? (
            <p className="text-emerald-400 italic">No retailer orders yet.</p>
          ) : (
            <ul className="space-y-2 text-lg">
              {orders.map((o) => (
                <li key={o.id} className="border p-2 rounded bg-white/20 shadow-inner border-white/20">{(productMap[o.productId]?.name ?? 'Unknown Product')} - {o.quantity} {(productMap[o.productId]?.unit ?? '')}</li>
              ))}
            </ul>
          )}
        </section>
        {/* Trigger Payment Button */}
        <button
          onClick={triggerPayment}
          className="mt-4 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-xl shadow-xl transition-all duration-200"
        >
          Trigger Payment
        </button>
      </div>
    </div>
  );
}
