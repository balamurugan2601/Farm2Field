import { useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default function SensorSimulator({ shipmentId }) {
  useEffect(() => {
    if (!shipmentId) return;

    const interval = setInterval(async () => {
      const sensorData = {
        shipmentId,
        temperature: randomInt(20, 40),
        humidity: randomInt(50, 90),
        gasLevel: randomInt(5, 30),
        weight: randomInt(900, 1000),
        location: {
          lat: 11.34 + (Math.random() - 0.5) * 0.01,
          lng: 78.12 + (Math.random() - 0.5) * 0.01,
        },
        timestamp: serverTimestamp(),
      };

      try {
        await addDoc(collection(db, 'shipments', shipmentId, 'sensorData'), sensorData);
        console.log(`Pushed to ${shipmentId}`, sensorData);
      } catch (e) {
        console.error('Sensor data push error:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [shipmentId]);

  return null;
}
