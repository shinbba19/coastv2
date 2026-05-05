import { NextResponse } from "next/server";

const PROPERTIES = [
  {
    id: 1,
    name: "The Palm Wongamat 2 Bedroom",
    description: "Premium 2-bedroom beachfront condominium on Wongamat Beach with panoramic sea views and resort-style facilities.",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400",
    location: "Wongamat Beach, Pattaya, Thailand",
    thbPrice: 20000000,
    targetAmount: 666667,
  },
  {
    id: 2,
    name: "Grand Florida 1 Bedroom",
    description: "Modern 1-bedroom resort-style condominium with sea views, private beach access, and world-class amenities.",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
    location: "Na Jomtien, Pattaya, Thailand",
    thbPrice: 6000000,
    targetAmount: 200000,
  },
  {
    id: 3,
    name: "Andromeda Pratumnak",
    description: "Luxury condominium on prestigious Pratumnak Hill with stunning sea views and premium lifestyle amenities.",
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400",
    location: "Pratumnak Hill, Pattaya, Thailand",
    thbPrice: 12000000,
    targetAmount: 400000,
  },
];

export async function GET(request, { params }) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  const prop = PROPERTIES.find((p) => p.id === id);

  const metadata = prop
    ? {
        name: prop.name,
        description: prop.description,
        image: prop.image,
        external_url: `https://coastv2.onrender.com/asset/${prop.id}`,
        attributes: [
          { trait_type: "Location", value: prop.location },
          { trait_type: "Property Value (THB)", value: prop.thbPrice.toLocaleString() },
          { trait_type: "Funding Target (mUSDT)", value: prop.targetAmount.toLocaleString() },
          { trait_type: "Token ID", value: String(id) },
          { trait_type: "Network", value: "Sepolia Testnet" },
        ],
      }
    : {
        name: `COAST Property #${id}`,
        description: "A tokenized real estate asset on the COAST platform.",
        image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
        attributes: [{ trait_type: "Token ID", value: String(id) }],
      };

  return NextResponse.json(metadata, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
