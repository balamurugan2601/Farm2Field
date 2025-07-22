import { useEffect, useState } from 'react';
import { db, auth } from '../services/firebase';
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  updateDoc,
  doc,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import Web3 from 'web3';
import contract from '../services/contract';
import SensorSimulator from '../components/SensorSimulator'; // Added import for SensorSimulator

export default function RetailerDashboard() {
  const [orders, setOrders] = useState([]);
  const [productMap, setProductMap] = useState({});
  const [shipments, setShipments] = useState({});
  const [user, setUser] = useState(null);
  // Retailer stock state
  const [allProducts, setAllProducts] = useState([]);
  const [retailerStock, setRetailerStock] = useState([]);
  // Add state for order quantity
  const [orderQuantity, setOrderQuantity] = useState({});
  const [sensorData, setSensorData] = useState({}); // {shipmentId: latestData}

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Listen for retailer stock in real-time
    const unsubRetailerStock = onSnapshot(collection(db, 'retailerStock'), (snap) => {
      setRetailerStock(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    // Listen for orders for this retailer
    const q = query(collection(db, 'orders'), where('retailerId', '==', user.uid));
    const unsubOrders = onSnapshot(q, async (snap) => {
      const list = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setOrders(list);
      // Fetch product details for all productIds
      const productIds = list.map((o) => o.productId);
      const unsubProducts = onSnapshot(collection(db, 'products'), (prods) => {
        const pMap = {};
        prods.docs.forEach((d) => { if (productIds.includes(d.id)) pMap[d.id] = d.data(); });
        setProductMap(pMap);
      });
      // Fetch related shipments for these orders
      const unsubShipments = onSnapshot(collection(db, 'shipments'), (allShipments) => {
        const shipmentMap = {};
        list.forEach((o) => {
          const s = allShipments.docs.find((d) => d.data().productId === o.productId && d.data().supplierId === o.supplierId);
          if (s) shipmentMap[o.id] = s.data();
        });
        setShipments(shipmentMap);
      });
      // Clean up listeners
      return () => { unsubProducts(); unsubShipments(); };
    });
    // Listen for all products with farmerId
    const unsubAllProducts = onSnapshot(collection(db, 'products'), (prods) => {
      setAllProducts(prods.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubOrders(); unsubAllProducts(); unsubRetailerStock(); };
  }, [user]);

  // Confirm delivery (retailer side)
  const confirmDelivery = async (order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'delivered',
        deliveredAt: serverTimestamp(),
      });
      // Log on blockchain
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const accounts = await web3.eth.getAccounts();
      const deliveryDataStr = JSON.stringify({
        orderId: order.id,
        retailerId: order.retailerId,
        deliveredAt: new Date().toISOString(),
      });
      await contract.methods.logDelivery(order.id, deliveryDataStr).send({ from: accounts[0] });
      alert('✅ Delivery confirmed and logged on blockchain');
    } catch (err) {
      console.error(err);
      alert('❌ Failed to confirm delivery or log on blockchain: ' + (err?.message || err));
    }
  };

  useEffect(() => {
    if (!user) return;
    const unsubDeliveredShipments = onSnapshot(
      query(collection(db, 'shipments'), where('status', '==', 'delivered')),
      async (snap) => {
        for (const docSnap of snap.docs) {
          const shipment = docSnap.data();
          // Find orders for this retailer, product, and delivered shipment
          const q = query(collection(db, 'orders'), where('retailerId', '==', user.uid), where('productId', '==', shipment.productId), where('supplierId', '==', shipment.supplierId), where('status', '==', 'delivered'));
          const orderSnap = await getDocs(q);
          for (const orderDoc of orderSnap.docs) {
            const order = orderDoc.data();
            // Check if already stocked
            const stockSnap = await getDocs(query(collection(db, 'retailerStock'), where('retailerId', '==', user.uid), where('productId', '==', shipment.productId)));
            let alreadyStocked = false;
            let stockDocId = null;
            let currentQty = 0;
            stockSnap.forEach((s) => {
              alreadyStocked = true;
              stockDocId = s.id;
              currentQty = parseFloat(s.data().quantity || 0);
            });
            if (!alreadyStocked) {
              await addDoc(collection(db, 'retailerStock'), {
                retailerId: user.uid,
                productId: shipment.productId,
                quantity: order.quantity,
                addedAt: serverTimestamp(),
              });
            } else if (currentQty < order.quantity) {
              await updateDoc(doc(db, 'retailerStock', stockDocId), {
                quantity: order.quantity,
                updatedAt: serverTimestamp(),
              });
            }
          }
        }
      }
    );
    return () => unsubDeliveredShipments();
  }, [user]);

  // Add order handler
  const handleOrder = async (product) => {
    const quantity = parseFloat(orderQuantity[product.id] || 0);
    if (!quantity || quantity <= 0) return alert('Enter a valid quantity');
    if (!user) return alert('You must be logged in to place an order.');
    const total = quantity * product.price;
    try {
      await addDoc(collection(db, 'orders'), {
        productId: product.id,
        retailerId: user.uid,
        farmerId: product.farmerId, // <-- Add farmerId to the order
        quantity,
        total,
        status: 'placed',
        placedAt: serverTimestamp(),
      });
      alert('✅ Order placed successfully!');
      setOrderQuantity((prev) => ({ ...prev, [product.id]: '' }));
    } catch (err) {
      console.error('Firestore error:', err);
      alert(`❌ Failed to place order: ${err.message}`);
    }
  };

  // Add payment handler
  const handlePayment = async (order) => {
    if (!window.ethereum) {
      alert('MetaMask not detected!');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const sender = accounts[0];
      let ethValue = 0.00001; // Very low value for Sepolia
      const value = Web3.utils.toWei(ethValue.toString(), 'ether');
      await contract.methods.pay().send({ from: sender, value });
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
      });
      alert('✅ Payment successful and order marked as paid!');
    } catch (err) {
      console.error('Payment error:', err);
      alert('❌ Payment failed or rejected: ' + (err?.message || err));
    }
  };

  // Fetch latest sensor data for each shipment every 3 seconds
  useEffect(() => {
    const shipmentIds = Object.values(shipments).map(s => s.id);
    if (!shipmentIds.length) return;
    const interval = setInterval(async () => {
      const newSensorData = {};
      for (const id of shipmentIds) {
        const q = query(collection(db, 'shipments', id, 'sensorData'), orderBy('timestamp', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          newSensorData[id] = snap.docs[0].data();
        }
      }
      setSensorData(newSensorData);
    }, 3000);
    return () => clearInterval(interval);
  }, [shipments]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 to-emerald-300 p-8 font-montserrat">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-900 mb-8">Retailer Dashboard</h1>
        {/* All Products Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">🌾 Available Farmer Products</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {allProducts.filter(product => {
              const totalStocked = retailerStock.filter(s => s.productId === product.id).reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
              const available = parseFloat(product.quantity || 0) - totalStocked;
              return available > 0;
            }).map((product) => {
              const totalStocked = retailerStock.filter(s => s.productId === product.id).reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
              const available = parseFloat(product.quantity || 0) - totalStocked;
              return (
                <div key={product.id} className="bg-white/20 p-4 rounded-xl shadow-inner border border-white/20 flex flex-col">
                  <div className="font-bold text-emerald-900 mb-1">{product.name}</div>
                  <div className="text-emerald-800">Category: {product.category}</div>
                  <div className="text-emerald-800">Farmer: {product.farmerId}</div>
                  <div className="text-emerald-800">Price: ₹{product.price} / {product.unit}</div>
                  <div className="text-emerald-800">Available: {available}</div>
                  <div className="mt-2 flex gap-2 items-center">
                    <input
                      type="number"
                      min="1"
                      max={available}
                      placeholder="Quantity"
                      value={orderQuantity[product.id] || ''}
                      onChange={e => setOrderQuantity({ ...orderQuantity, [product.id]: e.target.value })}
                      className="w-20 border border-white/20 bg-white/20 text-emerald-900 rounded-lg px-2 py-1 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner placeholder-emerald-500 transition"
                    />
                    <button
                      onClick={() => handleOrder(product)}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold py-1 rounded-lg shadow-xl transition"
                    >
                      Order
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">📦 Your Stocked Products</h2>
          {retailerStock.filter(s => s.retailerId === user?.uid).length === 0 ? (
            <p className="text-emerald-600 italic">No products stocked yet.</p>
          ) : (
            <ul className="space-y-3">
              {retailerStock.filter(s => s.retailerId === user?.uid).map((s) => {
                const prod = allProducts.find(p => p.id === s.productId);
                // Find the latest active shipment for this product
                const activeShipment = Object.values(shipments).find(sh => sh.productId === s.productId && (sh.status === 'assigned' || sh.status === 'pending' || sh.status === 'in transit'));
                return (
                  <li key={s.id} className="bg-white/20 rounded-xl p-4 shadow-inner border border-white/20 flex items-center justify-between gap-4">
                    {/* Start sensor simulation for assigned, pending, or in transit shipments only */}
                    {activeShipment && <SensorSimulator shipmentId={activeShipment.id} />}
                    <div>
                      <div className="font-bold text-emerald-900">{prod?.name || s.productId}</div>
                      <div className="text-emerald-800">Category: {prod?.category}</div>
                      <div className="text-emerald-800">Quantity: {s.quantity} {prod?.unit}</div>
                      {activeShipment && sensorData[activeShipment.id] ? (
                        <ul className="text-emerald-900 text-base mb-2">
                          <li>🌡 Temp: <b>{sensorData[activeShipment.id].temperature}</b> °C</li>
                          <li>💧 Humidity: <b>{sensorData[activeShipment.id].humidity}</b> %</li>
                          <li>🪫 Gas Level: <b>{sensorData[activeShipment.id].gasLevel}</b></li>
                          <li>⚖ Weight: <b>{sensorData[activeShipment.id].weight}</b> kg</li>
                          <li>📍 Location: <b>Lat {sensorData[activeShipment.id].location?.lat?.toFixed(4)}, Lng {sensorData[activeShipment.id].location?.lng?.toFixed(4)}</b></li>
                        </ul>
                      ) : (
                        <div className="text-emerald-600 italic">No sensor data yet.</div>
                      )}
                    </div>
                    {activeShipment && (
                      <span className="bg-emerald-200 text-emerald-900 font-semibold px-3 py-1 rounded-full shadow">Stock updated after delivery</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Dedicated Shipments & Sensor Data Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">📦 Your Shipments & Live Sensor Data</h2>
          {Object.values(shipments).filter(s => s.retailerId === user?.uid).length === 0 ? (
            <p className="text-emerald-600 italic">No shipments assigned yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {Object.values(shipments).filter(s => s.retailerId === user?.uid).map((s) => (
                <div key={s.id} className="bg-white/20 p-4 rounded-xl shadow-inner border border-white/20">
                  <div className="font-bold text-emerald-900 mb-2">Shipment ID: {s.id}</div>
                  <div className="text-emerald-800 mb-1">Product: {productMap[s.productId]?.name || s.productId}</div>
                  <div className="text-emerald-800 mb-1">Status: {s.status}</div>
                  <div className="text-emerald-800 mb-1">Supplier: {s.supplierId}</div>
                  {sensorData[s.id] ? (
                    <ul className="text-emerald-900 text-base mb-2">
                      <li>🌡 Temp: <b>{sensorData[s.id].temperature}</b> °C</li>
                      <li>💧 Humidity: <b>{sensorData[s.id].humidity}</b> %</li>
                      <li>🪫 Gas Level: <b>{sensorData[s.id].gasLevel}</b></li>
                      <li>⚖ Weight: <b>{sensorData[s.id].weight}</b> kg</li>
                      <li>📍 Location: <b>Lat {sensorData[s.id].location?.lat?.toFixed(4)}, Lng {sensorData[s.id].location?.lng?.toFixed(4)}</b></li>
                    </ul>
                  ) : (
                    <div className="text-emerald-600 italic">No sensor data yet.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Live Sensor Data Block (copied from SupplierDashboard) */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">🚚 Live Sensor Data for Your Shipments</h2>
          {Object.values(shipments).filter(s => s.retailerId === user?.uid).length === 0 ? (
            <p className="text-emerald-600 italic">No shipments assigned yet.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {Object.values(shipments).filter(s => s.retailerId === user?.uid).map((s) => (
                <div key={s.id} className="bg-white/20 p-4 rounded-xl shadow-inner border border-white/20">
                  {/* Start sensor simulation for assigned, pending, or in transit shipments only */}
                  {(s.status === 'assigned' || s.status === 'pending' || s.status === 'in transit') && <SensorSimulator shipmentId={s.id} />}
                  <div className="font-bold text-emerald-900 mb-2">Shipment ID: {s.id}</div>
                  <div className="text-emerald-800 mb-1">Product: {productMap[s.productId]?.name || s.productId}</div>
                  <div className="text-emerald-800 mb-1">Status: {s.status}</div>
                  <div className="text-emerald-800 mb-1">Supplier: {s.supplierId}</div>
                  {sensorData[s.id] ? (
                    <ul className="text-emerald-900 text-base mb-2">
                      <li>🌡 Temp: <b>{sensorData[s.id].temperature}</b> °C</li>
                      <li>💧 Humidity: <b>{sensorData[s.id].humidity}</b> %</li>
                      <li>🪫 Gas Level: <b>{sensorData[s.id].gasLevel}</b></li>
                      <li>⚖ Weight: <b>{sensorData[s.id].weight}</b> kg</li>
                      <li>📍 Location: <b>Lat {sensorData[s.id].location?.lat?.toFixed(4)}, Lng {sensorData[s.id].location?.lng?.toFixed(4)}</b></li>
                    </ul>
                  ) : (
                    <div className="text-emerald-600 italic">No sensor data yet.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">🧾 Orders</h2>
          {orders.length === 0 ? (
            <p className="text-emerald-700">No orders yet.</p>
          ) : (
            <ul className="space-y-4">
              {orders.map((o) => {
                const shipment = Object.values(shipments).find(s => s.productId === o.productId && s.supplierId === o.supplierId && (s.status === 'assigned' || s.status === 'pending' || s.status === 'in transit' || s.status === 'delivered'));
                return (
                  <li key={o.id} className="bg-white/20 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-emerald-900">Order ID: {o.id}</div>
                      <div className="text-emerald-800">Product: {productMap[o.productId]?.name || o.productId}</div>
                      <div className="text-emerald-800">Retailer: {o.retailerId}</div>
                      <div className="text-emerald-800">Status: {o.status}</div>
                      {o.status === 'delivered' && o.deliveredAt && (
                        <div className="text-emerald-700 text-sm">Delivered at: {o.deliveredAt.toDate?.().toLocaleString?.() || o.deliveredAt}</div>
                      )}
                      {o.status === 'delivered' && o.supplierId && (
                        <div className="text-emerald-700 text-sm">Supplier: {o.supplierId}</div>
                      )}
                      {/* Show sensor data if available and shipment is not delivered */}
                      {shipment && (shipment.status === 'assigned' || shipment.status === 'pending' || shipment.status === 'in transit') && sensorData[shipment.id] ? (
                        <ul className="text-emerald-900 text-base mb-2">
                          <li>🌡 Temp: <b>{sensorData[shipment.id].temperature}</b> °C</li>
                          <li>💧 Humidity: <b>{sensorData[shipment.id].humidity}</b> %</li>
                          <li>🪫 Gas Level: <b>{sensorData[shipment.id].gasLevel}</b></li>
                          <li>⚖ Weight: <b>{sensorData[shipment.id].weight}</b> kg</li>
                          <li>📍 Location: <b>Lat {sensorData[shipment.id].location?.lat?.toFixed(4)}, Lng {sensorData[shipment.id].location?.lng?.toFixed(4)}</b></li>
                        </ul>
                      ) : null}
                    </div>
                    <div className="mt-4 md:mt-0 flex flex-col gap-2">
                      {o.status === 'shipped' && (
                        <span className="text-emerald-700">In Transit</span>
                      )}
                      {o.status === 'delivered' && !o.paidAt && (
                        <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow" onClick={() => confirmDelivery(o)}>Confirm Delivery</button>
                      )}
                      {o.status !== 'paid' && (
                        <button
                          onClick={() => handlePayment(o)}
                          className="mt-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold px-4 py-2 rounded-xl shadow-xl transition-all duration-200"
                        >
                          Make Payment
                        </button>
                      )}
                      {o.status === 'paid' && <span className="text-emerald-700">Paid</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
