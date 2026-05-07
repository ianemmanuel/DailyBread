"use client"

import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'

import 'mapbox-gl/dist/mapbox-gl.css';

const Map = () => {
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const mapContainerRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!mapContainerRef.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN as string;

        mapRef.current = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v11",
            center: [36.8219, -1.2921], // Nairobi 👀
            zoom: 10,
        });

        return () => {
            mapRef.current?.remove();
        };
    }, []);

    return (
        <div className="w-full h-full" id='map-container' ref={mapContainerRef}>
            Map
        </div>
    )
}

export default Map