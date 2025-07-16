import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';

export default function AssignmentShipment() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [ordersNeedingShipment, setOrdersNeedingShipment] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('');

  useEffect(() => {
    // Fetch suppliers
    const unsubSuppliers = onSnapshot(collection(db, 'users'), (snap) => {
      setSuppliers(snap.docs.filter((d) => d.data().role === 'supplier').map((d) => ({ id: d.id, ...d.data() })));
    });
    // Fetch orders that need a supplier (status: paid, no supplierId)
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('status', '==', 'paid')), (snap) => {
      const orders = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => !o.supplierId || o.supplierId === '' || o.supplierId === null);
      setOrdersNeedingShipment(orders);
    });
    // Fetch all products for display
    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubSuppliers(); unsubOrders(); unsubProducts(); };
  }, []);

  const assignShipment = async () => {
    if (!selectedSupplier || !selectedOrder) return alert('Select both');
    const order = ordersNeedingShipment.find(o => o.id === selectedOrder);
    if (!order) return alert('Order not found');
    // 1. Assign shipment
    const shipmentRef = await addDoc(collection(db, 'shipments'), {
      supplierId: selectedSupplier,
      productId: order.productId,
      retailerId: order.retailerId,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'shipments', shipmentRef.id, 'sensorData', 'init'), { temp: 0, humidity: 0 });
    // 2. Update the order with the supplierId and status
    await updateDoc(doc(db, 'orders', order.id), {
      supplierId: selectedSupplier,
      status: 'assigned',
      statusUpdatedAt: serverTimestamp(),
    });
    alert('Shipment assigned and order updated!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 to-emerald-300 p-8 font-montserrat">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-900 mb-8">Assign Shipment</h1>
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl ring-1 ring-white/10 shadow-xl p-8">
          <div className="mb-4">
            <label className="block text-emerald-900 font-semibold mb-2">Select Supplier:</label>
            <select className="w-full p-2 rounded-xl border border-emerald-300" value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)}>
              <option value="">-- Select --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-emerald-900 font-semibold mb-2">Select Order (Product):</label>
            <select className="w-full p-2 rounded-xl border border-emerald-300" value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)}>
              <option value="">-- Select --</option>
              {ordersNeedingShipment.map(o => {
                const prod = products.find(p => p.id === o.productId);
                return <option key={o.id} value={o.id}>{prod?.name || o.productId} (Qty: {o.quantity})</option>;
              })}
            </select>
          </div>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl shadow" onClick={assignShipment}>Assign Shipment</button>
        </div>
      </div>
    </div>
  );
}
       