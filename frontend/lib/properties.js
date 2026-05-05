"use client";
import { useState, useEffect } from "react";

const SEED = [
  { id: 1, name: "The Palm Wongamat 2 Bedroom", location: "Wongamat Beach, Pattaya, Thailand", description: "Premium 2-bedroom beachfront condominium on Wongamat Beach with panoramic sea views and resort-style facilities.", image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400", thbPrice: 20000000, targetAmount: 666667 },
  { id: 2, name: "Grand Florida 1 Bedroom", location: "Na Jomtien, Pattaya, Thailand", description: "Modern 1-bedroom resort-style condominium with sea views, private beach access, and world-class amenities.", image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400", thbPrice: 6000000, targetAmount: 200000 },
  { id: 3, name: "Andromeda Pratumnak", location: "Pratumnak Hill, Pattaya, Thailand", description: "Luxury condominium on prestigious Pratumnak Hill with stunning sea views and premium lifestyle amenities.", image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400", thbPrice: 12000000, targetAmount: 400000 },
];
const STORAGE_KEY = "coast_properties_v3";

export function getProperties() {
  if (typeof window === "undefined") return SEED;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : SEED;
  } catch {
    return SEED;
  }
}

export function addProperty(prop) {
  const current = getProperties();
  const newId = Math.max(...current.map((p) => p.id), 0) + 1;
  const newProp = { ...prop, id: newId };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, newProp]));
  return newProp;
}

export function deleteProperty(id) {
  const current = getProperties();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.filter((p) => p.id !== id)));
}

export function useProperties() {
  const [properties, setProperties] = useState(SEED);

  useEffect(() => {
    setProperties(getProperties());
  }, []);

  function add(prop) {
    const newProp = addProperty(prop);
    setProperties(getProperties());
    return newProp;
  }

  function remove(id) {
    deleteProperty(id);
    setProperties(getProperties());
  }

  return { properties, add, remove };
}
