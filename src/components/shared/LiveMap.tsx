"use client";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface LiveMapProps {
  barberLat: number | null;
  barberLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  barberLocationUpdatedAt: string | null;
  // Tekst onder het pin-icoon in de statische terugval — klant/status
  // gebruikte "Live kaart", barber/rit "Navigatie".
  placeholderLabel: string;
}

const STALE_MS = 2 * 60 * 1000;
const DIRECTIONS_REFETCH_MS = 20 * 1000;
const DIRECTIONS_MIN_MOVE_M = 50;
const NL_CENTER: [number, number] = [5.2913, 52.1326];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-[#C6CBD1] flex-col gap-2">
      <MapPin size={40} />
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  );
}

// Gedeeld tussen klant/status ("Live kaart") en barber/rit ("Navigatie") —
// vervangt de statische placeholder zodra er een Mapbox-token is. Zonder
// token (NEXT_PUBLIC_MAPBOX_TOKEN niet gezet) of bij een laadfout valt dit
// component vanzelf terug op exact dezelfde statische placeholder als
// voorheen — geen crash, geen kale kaart.
export function LiveMap({
  barberLat,
  barberLng,
  destinationLat,
  destinationLng,
  barberLocationUpdatedAt,
  placeholderLabel,
}: LiveMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const barberMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastDirectionsRef = useRef<{ time: number; lat: number; lng: number } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  // Kaart één keer opzetten.
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    try {
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: destinationLat != null && destinationLng != null ? [destinationLng, destinationLat] : NL_CENTER,
        zoom: 12,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => setMapLoaded(true));
      map.on("error", () => setMapError(true));
      mapRef.current = map;
    } catch {
      setMapError(true);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Alleen bij het opzetten — latere prop-wijzigingen updaten markers/
    // route, niet de hele kaart opnieuw aanmaken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Bestemmingsmarker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || destinationLat == null || destinationLng == null) return;
    if (destMarkerRef.current) {
      destMarkerRef.current.setLngLat([destinationLng, destinationLat]);
    } else {
      destMarkerRef.current = new mapboxgl.Marker({ color: "#111111" })
        .setLngLat([destinationLng, destinationLat])
        .addTo(map);
    }
  }, [mapLoaded, destinationLat, destinationLng]);

  // Barbermarker + kaart automatisch op beide punten inzoomen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || barberLat == null || barberLng == null) return;
    if (barberMarkerRef.current) {
      barberMarkerRef.current.setLngLat([barberLng, barberLat]);
    } else {
      barberMarkerRef.current = new mapboxgl.Marker({ color: "#0EA5A4" }).setLngLat([barberLng, barberLat]).addTo(map);
    }
    if (destinationLat != null && destinationLng != null) {
      map.fitBounds(
        [
          [Math.min(barberLng, destinationLng), Math.min(barberLat, destinationLat)],
          [Math.max(barberLng, destinationLng), Math.max(barberLat, destinationLat)],
        ],
        { padding: 64, maxZoom: 15, duration: 500 }
      );
    } else {
      map.flyTo({ center: [barberLng, barberLat], zoom: 14 });
    }
  }, [mapLoaded, barberLat, barberLng, destinationLat, destinationLng]);

  // Routelijn + ETA via Mapbox Directions — gethrottled: alleen opnieuw
  // ophalen als de barber merkbaar verplaatst is of het al 20s geleden is,
  // niet bij elke losse GPS-tick (zuiniger op het gratis quotum).
  useEffect(() => {
    const map = mapRef.current;
    if (!token || !map || !mapLoaded || barberLat == null || barberLng == null || destinationLat == null || destinationLng == null) {
      return;
    }
    const now = Date.now();
    const last = lastDirectionsRef.current;
    if (last) {
      const movedM = haversineMeters(last.lat, last.lng, barberLat, barberLng);
      if (now - last.time < DIRECTIONS_REFETCH_MS && movedM < DIRECTIONS_MIN_MOVE_M) return;
    }
    lastDirectionsRef.current = { time: now, lat: barberLat, lng: barberLng };

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${barberLng},${barberLat};${destinationLng},${destinationLat}?geometries=geojson&access_token=${token}`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const route = data?.routes?.[0];
        if (!route) return;
        setEtaMinutes(Math.round(route.duration / 60));
        const geojson: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: route.geometry };
        const source = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
        } else {
          map.addSource("route", { type: "geojson", data: geojson });
          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#0EA5A4", "line-width": 4 },
          });
        }
      })
      .catch(() => {
        // Stil negeren — de markers/kaart blijven gewoon werken zonder
        // route/ETA, niet blokkerend voor de rest van het scherm.
      });
  }, [token, mapLoaded, barberLat, barberLng, destinationLat, destinationLng]);

  if (!token || mapError) {
    return <Placeholder label={placeholderLabel} />;
  }

  const stale = !!barberLocationUpdatedAt && Date.now() - new Date(barberLocationUpdatedAt).getTime() > STALE_MS;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      {barberLat != null ? (
        <div className="absolute left-3 bottom-3 bg-white rounded-md shadow-[0_2px_8px_rgba(0,0,0,.15)] px-3 py-2 text-[13px] font-medium text-text-primary">
          {stale ? "Laatst gezien een tijdje geleden" : etaMinutes != null ? `Nog ongeveer ${etaMinutes} min` : "Route wordt berekend…"}
        </div>
      ) : (
        <div className="absolute left-3 bottom-3 bg-white rounded-md shadow-[0_2px_8px_rgba(0,0,0,.15)] px-3 py-2 text-[13px] font-medium text-text-secondary">
          Wachten op locatie van de barber…
        </div>
      )}
    </div>
  );
}
