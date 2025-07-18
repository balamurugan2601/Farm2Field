import { useEffect, useState } from 'react';
import { db, auth } from '../services/firebase';
import {
  collection,
  serverTimestamp,
  query,
  where,
  updateDoc,
  doc,
  onSnapshot,
  getDoc,
  addDoc,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import Web3 from 'web3';
import contract from '../services/contract';
import SensorSimulator from '../components/SensorSimulator';

export default function SupplierDashboard() {
  const [shipments, setShipments] = useState([]);
  const [user, setUser] = useState(null);
  const [sensorData, setSensorData] = useState({}); // {shipmentId: latestData}

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    // Listen for shipments assigned to this supplier
    const qShip = query(collection(db, 'shipments'), where('supplierId', '==', user.uid));
    const unsubShip = onSnapshot(qShip, (snap) => {
      const list = [];
      snap.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setShipments(list);
    });
    return () => { unsubShip(); };
  }, [user]);

  // Fetch latest sensor data for each shipment every 3 seconds
  useEffect(() => {
    if (!shipments.length) return;
    const interval = setInterval(async () => {
      const newSensorData = {};
      for (const s of shipments) {
        const q = query(collection(db, 'shipments', s.id, 'sensorData'), orderBy('timestamp', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          newSensorData[s.id] = snap.docs[0].data();
        }
      }
      setSensorData(newSensorData);
    }, 3000);
    return () => clearInterval(interval);
  }, [shipments]);

  // Mark shipment as in transit
  const markInTransit = async (shipmentId) => {
    await updateDoc(doc(db, 'shipments', shipmentId), {
      status: 'in transit',
      statusUpdatedAt: serverTimestamp(),
    });
  };

  // Confirm delivery for a shipment (Firestore + blockchain)
  const confirmDelivery = async (shipmentId) => {
    try {
      await updateDoc(doc(db, 'shipments', shipmentId), {
        status: 'delivered',
        deliveredAt: serverTimestamp(),
      });
      // Fetch shipment details to get retailerId and productId
      const shipmentDoc = await getDoc(doc(db, 'shipments', shipmentId));
      const shipment = shipmentDoc.data();
      if (shipment && shipment.retailerId && shipment.productId) {
        // Find the corresponding order for this shipment
        const ordersSnap = await (await import('firebase/firestore')).getDocs(
          query(collection(db, 'orders'),
            where('retailerId', '==', shipment.retailerId),
            where('productId', '==', shipment.productId),
            where('supplierId', '==', shipment.supplierId),
            where('status', '==', 'delivered')
          )
        );
        for (const orderDoc of ordersSnap.docs) {
          const order = orderDoc.data();
          // Check if already stocked
          const stockSnap = await (await import('firebase/firestore')).getDocs(query(collection(db, 'retailerStock'), where('retailerId', '==', shipment.retailerId), where('productId', '==', shipment.productId)));
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
              retailerId: shipment.retailerId,
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
      // Log on blockchain
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const accounts = await web3.eth.getAccounts();
      const deliveryDataStr = JSON.stringify({
        shipmentId,
        supplierId: user.uid,
        deliveredAt: new Date().toISOString(),
      });
      await contract.methods.logDelivery(shipmentId, deliveryDataStr).send({ from: accounts[0] });
      alert('✅ Delivery confirmed, retailer stock updated, and logged on blockchain');
    } catch (err) {
      console.error(err);
      alert('❌ Failed to confirm delivery or log on blockchain: ' + (err?.message || err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 to-emerald-300 p-8 font-montserrat">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-900 mb-8">Supplier Dashboard</h1>
        {/* Product Creation Form */}
        {/* Your Products Section */}
        {/* Shipments Section */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-semibold text-emerald-900 mb-4">🚚 Shipments</h2>
          {shipments.length === 0 ? (
            <p className="text-emerald-700">No shipments assigned yet.</p>
          ) : (
            <ul className="space-y-4">
              {shipments.map((s) => (
                <li key={s.id} className="bg-white/20 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between">
                  {/* Start sensor simulation for assigned, pending, or in transit shipments only */}
                  {(s.status === 'assigned' || s.status === 'pending' || s.status === 'in transit') && <SensorSimulator shipmentId={s.id} />}
                  <div>
                    <div className="font-semibold text-emerald-900">Shipment ID: {s.id}</div>
                    <div className="text-emerald-800">Product: {s.productId}</div>
                    <div className="text-emerald-800">Status: {s.status}</div>
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
                    {s.status === 'delivered' && (
                      <>
                        <div className="text-emerald-700">Delivered at: {s.deliveredAt?.toDate?.().toLocaleString?.() || s.deliveredAt}</div>
                        <div className="text-emerald-700">Retailer: {s.retailerId}</div>
                      </>
                    )}
                  </div>
                  <div className="mt-4 md:mt-0 flex flex-col gap-2">
                    {s.status === 'pending' && (
                      <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow" onClick={() => markInTransit(s.id)}>Mark In Transit</button>
                    )}
                    {s.status === 'in transit' && (
                      <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow" onClick={() => confirmDelivery(s.id)}>Confirm Delivery</button>
                    )}
                    {s.status === 'delivered' && <span className="text-emerald-700">Delivered</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
