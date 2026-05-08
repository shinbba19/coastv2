"use client";
import { useState, useEffect } from "react";

const SEED = [
  { id: 1, name: "The Palm Wongamat 2 Bedroom", location: "Wongamat Beach, Pattaya, Thailand", description: "Premium 2-bedroom beachfront condominium on Wongamat Beach with panoramic sea views and resort-style facilities.", image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400", thbPrice: 600000, targetAmount: 20000 },
  { id: 2, name: "Grand Florida 1 Bedroom", location: "Na Jomtien, Pattaya, Thailand", description: "Modern 1-bedroom resort-style condominium with sea views, private beach access, and world-class amenities.", image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=400", thbPrice: 600000, targetAmount: 20000 },
  { id: 3, name: "Andromeda Pratumnak", location: "Pratumnak Hill, Pattaya, Thailand", description: "Luxury condominium on prestigious Pratumnak Hill with stunning sea views and premium lifestyle amenities.", image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400", thbPrice: 600000, targetAmount: 20000 },
];
const STORAGE_KEY = "coast_properties_v5";

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
