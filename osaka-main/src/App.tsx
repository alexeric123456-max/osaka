import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import * as L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { 
  Search, 
  Heart, 
  MapPin, 
  Calendar, 
  Star, 
  ShoppingBag, 
  Utensils, 
  Camera, 
  ChevronRight, 
  Navigation,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SHINSAIBASHI_PLACES, type Place } from './data';
import { cn } from './lib/utils';

// --- Google Maps Style Markers ---
const createCustomIcon = (category: string, isHighlighted: boolean = false) => {
  const color = isHighlighted ? '#FBBF24' : (
    category === 'food' ? '#EA4335' : // Red
    category === 'shop' ? '#4285F4' : // Blue
    category === 'sight' ? '#34A853' : // Green
    '#757575' // Gray
  );

  const IconComponent = (
    category === 'food' ? Utensils :
    category === 'shop' ? ShoppingBag :
    category === 'sight' ? Camera :
    Navigation
  );

  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center -translate-y-1/2">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.61116 0 0 7.61116 0 17C0 27.5 17 42 17 42C17 42 34 27.5 34 17C34 7.61116 26.3888 0 17 0Z" fill={color}/>
        <circle cx="17" cy="17" r="13" fill="white" fillOpacity="0.2"/>
      </svg>
      <div className="absolute top-[8px] flex items-center justify-center">
        <IconComponent size={15} color="white" strokeWidth={3} />
      </div>
    </div>
  );

  return L.divIcon({
    html,
    className: 'custom-google-marker',
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42]
  });
};

const standardIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapFocusHandler({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}

const formatDistance = (meters: number) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

const inferFoodPreference = (place: Place): string => {
  if (place.category !== 'food') return 'other';
  const source = `${place.name} ${place.description}`.toLowerCase();
  if (source.includes('拉麵')) return 'ramen';
  if (source.includes('燒肉') || source.includes('和牛') || source.includes('牛')) return 'bbq';
  if (source.includes('壽司')) return 'sushi';
  if (source.includes('甜') || source.includes('蛋糕') || source.includes('鬆餅') || source.includes('可麗餅')) return 'dessert';
  if (source.includes('咖啡') || source.includes('cafe')) return 'coffee';
  if (source.includes('章魚燒') || source.includes('串炸') || source.includes('小吃') || source.includes('肉包')) return 'street';
  return 'other';
};

export default function App() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [foodPreference, setFoodPreference] = useState<string>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([34.6710, 135.5014]);
  
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('shinsaibashi_favs');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [itinerary, setItinerary] = useState<string[]>(() => {
    const saved = localStorage.getItem('shinsaibashi_itinerary');
    return saved ? JSON.parse(saved) : [];
  });

  const [routeStart, setRouteStart] = useState<Place | null>(null);
  const [routeEnd, setRouteEnd] = useState<Place | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [itineraryRoutePath, setItineraryRoutePath] = useState<[number, number][]>([]);
  const [itineraryRouteDistance, setItineraryRouteDistance] = useState<number | null>(null);
  const [isItineraryRouting, setIsItineraryRouting] = useState(false);
  const [itineraryRouteError, setItineraryRouteError] = useState('');

  // Function to calculate distance between two coordinates in meters
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  };

  const itineraryDetails = useMemo(() => {
    const details = itinerary.map(id => SHINSAIBASHI_PLACES.find(p => p.id === id)).filter(Boolean) as Place[];
    return details.map((place, index) => {
      let distanceToNext = 0;
      if (index < details.length - 1) {
        const next = details[index + 1];
        distanceToNext = calculateDistance(place.lat, place.lng, next.lat, next.lng);
      }
      return { ...place, distanceToNext };
    });
  }, [itinerary]);

  useEffect(() => {
    localStorage.setItem('shinsaibashi_favs', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('shinsaibashi_itinerary', JSON.stringify(itinerary));
  }, [itinerary]);

  const filteredPlaces = useMemo(() => {
    return SHINSAIBASHI_PLACES.filter(place => {
      const matchesCategory = activeCategory === 'all' || place.category === activeCategory;
      const matchesFoodPreference = activeCategory !== 'food' || foodPreference === 'all' || inferFoodPreference(place) === foodPreference;
      const matchesSearch = place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           place.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesFoodPreference && matchesSearch;
    });
  }, [activeCategory, foodPreference, searchQuery]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const toggleItinerary = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItinerary(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handlePlaceSelect = (place: Place) => {
    setSelectedPlace(place);
    setMapCenter([place.lat, place.lng]);
  };

  const selectRoutePoint = (type: 'start' | 'end', place: Place, e: React.MouseEvent) => {
    e.stopPropagation();
    if (type === 'start') {
      setRouteStart(place);
    } else {
      setRouteEnd(place);
    }
  };

  useEffect(() => {
    const fetchRoute = async () => {
      if (!routeStart || !routeEnd) {
        setRoutePath([]);
        setRouteDistance(null);
        setRouteError('');
        return;
      }

      setIsRouting(true);
      setRouteError('');

      try {
        const start = `${routeStart.lng},${routeStart.lat}`;
        const end = `${routeEnd.lng},${routeEnd.lat}`;
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/walking/${start};${end}?overview=full&geometries=geojson`
        );

        if (!response.ok) {
          throw new Error('Route API failed');
        }

        const data = await response.json();
        const route = data?.routes?.[0];
        if (!route?.geometry?.coordinates?.length) {
          throw new Error('No route result');
        }

        const coordinates = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        setRoutePath(coordinates);
        setRouteDistance(route.distance ?? null);
      } catch {
        const fallback = calculateDistance(routeStart.lat, routeStart.lng, routeEnd.lat, routeEnd.lng);
        setRoutePath([
          [routeStart.lat, routeStart.lng],
          [routeEnd.lat, routeEnd.lng],
        ]);
        setRouteDistance(fallback);
        setRouteError('目前改用直線估算距離（路網服務暫時不可用）');
      } finally {
        setIsRouting(false);
      }
    };

    fetchRoute();
  }, [routeStart, routeEnd]);

  useEffect(() => {
    const fetchItineraryRoute = async () => {
      if (itineraryDetails.length < 2) {
        setItineraryRoutePath([]);
        setItineraryRouteDistance(null);
        setItineraryRouteError('');
        return;
      }

      setIsItineraryRouting(true);
      setItineraryRouteError('');
      try {
        const points = itineraryDetails.map((p) => `${p.lng},${p.lat}`).join(';');
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/walking/${points}?overview=full&geometries=geojson`
        );
        if (!response.ok) {
          throw new Error('Itinerary route API failed');
        }
        const data = await response.json();
        const route = data?.routes?.[0];
        if (!route?.geometry?.coordinates?.length) {
          throw new Error('No itinerary route');
        }
        const coordinates = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        setItineraryRoutePath(coordinates);
        setItineraryRouteDistance(route.distance ?? null);
      } catch {
        const fallbackPath = itineraryDetails.map((p) => [p.lat, p.lng] as [number, number]);
        const fallbackDistance = itineraryDetails.slice(0, -1).reduce((total, p, idx) => {
          const next = itineraryDetails[idx + 1];
          return total + calculateDistance(p.lat, p.lng, next.lat, next.lng);
        }, 0);
        setItineraryRoutePath(fallbackPath);
        setItineraryRouteDistance(fallbackDistance);
        setItineraryRouteError('多點路網暫時不可用，改用直線估算');
      } finally {
        setIsItineraryRouting(false);
      }
    };

    fetchItineraryRoute();
  }, [itineraryDetails]);

  return (
    <div className="flex h-screen bg-[#0A0A0B] font-sans text-[#E2E8F0] overflow-hidden p-4 gap-4 relative">
      {/* Sidebar - Control Panel */}
      {isSidebarOpen && (
      <aside className="w-80 glass-panel rounded-3xl flex flex-col z-50 overflow-hidden shadow-2xl">
        <header className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#6366F1] rounded-xl flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">心齋橋攻略</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">深度旅遊地圖</p>
            </div>
          </div>
          
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="搜尋美食、景點、地標..." 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/40 border border-slate-700 rounded-full focus:ring-2 focus:ring-[#6366F1]/50 transition-all outline-none text-xs text-white placeholder:text-slate-600"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {[
              { id: 'all', label: '全部', icon: Navigation },
              { id: 'food', label: '美食', icon: Utensils },
              { id: 'shop', label: '購物', icon: ShoppingBag },
              { id: 'sight', label: '景點', icon: Camera },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border",
                  activeCategory === cat.id 
                    ? "bg-[#6366F1] text-white border-[#6366F1] shadow-[0_4px_12px_rgba(99,102,241,0.3)]" 
                    : "bg-slate-800/30 text-slate-400 border-white/5 hover:bg-slate-700/50 hover:text-white"
                )}
              >
                <cat.icon className="w-3 h-3" />
                {cat.label}
              </button>
            ))}
          </div>
          {activeCategory === 'food' && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">想吃什麼</p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'ramen', label: '拉麵' },
                  { id: 'bbq', label: '燒肉' },
                  { id: 'sushi', label: '壽司' },
                  { id: 'street', label: '小吃' },
                  { id: 'dessert', label: '甜點' },
                  { id: 'coffee', label: '咖啡' },
                  { id: 'other', label: '其他' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setFoodPreference(item.id)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-full text-[10px] font-bold border whitespace-nowrap transition-all",
                      foodPreference === item.id
                        ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                        : "bg-slate-800/30 text-slate-400 border-white/5 hover:bg-slate-700/50 hover:text-white"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="px-2 pb-1">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">所有店家與景點 ({filteredPlaces.length})</h2>
          </div>
          <AnimatePresence mode="popLayout">
            {filteredPlaces.map(place => (
              <motion.div
                key={place.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => handlePlaceSelect(place)}
                className={cn(
                  "group relative bg-slate-800/20 border rounded-2xl overflow-hidden cursor-pointer transition-all duration-300",
                  selectedPlace?.id === place.id 
                    ? "border-[#6366F1] shadow-[0_8px_20px_rgba(0,0,0,0.4)] bg-slate-800/40" 
                    : "border-white/5 hover:border-white/20 hover:bg-slate-800/30"
                )}
              >
                <div className="h-28 overflow-hidden relative">
                  <img 
                    src={place.image} 
                    alt={place.name} 
                    className={cn(
                      "w-full h-full object-cover transition-all duration-700",
                      selectedPlace?.id === place.id ? "scale-110 grayscale-0" : "grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100"
                    )}
                  />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button 
                      onClick={(e) => toggleFavorite(place.id, e)}
                      className={cn(
                        "p-1.5 rounded-full backdrop-blur-md transition-all border border-white/10",
                        favorites.includes(place.id) 
                          ? "bg-red-500 text-white border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                          : "bg-black/40 text-white hover:bg-red-500/80"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", favorites.includes(place.id) && "fill-current")} />
                    </button>
                    <button 
                      onClick={(e) => toggleItinerary(place.id, e)}
                      className={cn(
                        "p-1.5 rounded-full backdrop-blur-md transition-all border border-white/10",
                        itinerary.includes(place.id) 
                          ? "bg-[#6366F1] text-white border-[#6366F1]" 
                          : "bg-black/40 text-white hover:bg-[#6366F1]/80"
                      )}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <h3 className="font-bold text-xs leading-tight text-slate-100 group-hover:text-white transition-colors">{place.name}</h3>
                    <div className="flex items-center gap-1 shrink-0 bg-slate-900/50 px-1.5 py-0.5 rounded-lg">
                      <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                      <span className="text-[10px] font-bold text-yellow-500">{place.rating}</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-[#8E9299] mb-1 tracking-wider uppercase font-bold flex items-center gap-1.5">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      place.category === 'food' ? "bg-red-500" :
                      place.category === 'shop' ? "bg-blue-500" :
                      place.category === 'sight' ? "bg-green-500" : "bg-slate-600"
                    )} />
                    {place.category === 'food' ? '美食店家' : place.category === 'shop' ? '購物商場' : place.category === 'sight' ? '必訪景點' : '精選'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={(e) => selectRoutePoint('start', place, e)}
                      className={cn(
                        "text-[9px] py-1 rounded-md border transition-all font-bold",
                        routeStart?.id === place.id ? "bg-emerald-500/90 border-emerald-400 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
                      )}
                    >
                      起點
                    </button>
                    <button
                      onClick={(e) => selectRoutePoint('end', place, e)}
                      className={cn(
                        "text-[9px] py-1 rounded-md border transition-all font-bold",
                        routeEnd?.id === place.id ? "bg-rose-500/90 border-rose-400 text-white" : "border-white/10 text-slate-300 hover:bg-white/5"
                      )}
                    >
                      終點
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </main>

        <section className="p-5 border-t border-white/5 bg-slate-900/40">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">行程規劃 ({itinerary.length})</h4>
            {itinerary.length > 0 && (
              <button 
                onClick={() => setItinerary([])}
                className="text-[9px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest"
              >
                重置行程
              </button>
            )}
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {itineraryDetails.length === 0 ? (
              <div className="w-full py-4 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest italic">開始加入地點規劃行程</p>
              </div>
            ) : (
              itineraryDetails.map((p, index) => (
                <div key={p.id} className="relative shrink-0 flex items-center gap-2.5">
                  <div 
                    className="relative shrink-0 flex flex-col items-center gap-1.5 group cursor-pointer" 
                    onClick={() => handlePlaceSelect(p)}
                  >
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-white/10 shadow-lg group-hover:border-[#6366F1] transition-all group-hover:scale-105">
                      <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      <div className="absolute top-0 left-0 w-full h-full bg-black/20 group-hover:bg-transparent transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <MapPin className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <span className="text-[9px] font-black text-slate-500">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  
                  {index < itineraryDetails.length - 1 && (
                    <div className="flex flex-col items-center px-1">
                      <div className="flex items-center gap-1 text-[8px] font-black text-indigo-400/60 uppercase tracking-tighter">
                        <ChevronRight size={10} />
                        {Math.round(p.distanceToNext)}m
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="p-5 border-t border-white/5 bg-slate-900/40">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">兩點路線規劃</h4>
            {(routeStart || routeEnd) && (
              <button
                onClick={() => {
                  setRouteStart(null);
                  setRouteEnd(null);
                  setRoutePath([]);
                  setRouteDistance(null);
                  setRouteError('');
                }}
                className="text-[9px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest"
              >
                清除
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] text-slate-300 bg-slate-800/40 border border-white/10 rounded-xl p-2.5">
              <span className="font-black text-emerald-400">起點：</span>
              {routeStart ? routeStart.name : '請在店家卡片或地圖彈窗按「設為起點」'}
            </div>
            <div className="text-[10px] text-slate-300 bg-slate-800/40 border border-white/10 rounded-xl p-2.5">
              <span className="font-black text-rose-400">終點：</span>
              {routeEnd ? routeEnd.name : '請在店家卡片或地圖彈窗按「設為終點」'}
            </div>
          </div>

          <div className="mt-3 text-[10px] text-slate-400">
            {isRouting && <p>正在計算步行路線...</p>}
            {!isRouting && routeDistance !== null && (
              <p>
                實際距離：<span className="font-black text-indigo-300">{formatDistance(routeDistance)}</span>
              </p>
            )}
            {!isRouting && routeStart && routeEnd && routeDistance === null && (
              <p className="text-amber-300">目前無法取得路線距離</p>
            )}
            {routeError && <p className="text-amber-300 mt-1">{routeError}</p>}
          </div>
        </section>
      </aside>
      )}

      {/* Map View */}
      <section className="flex-1 relative glass-panel rounded-3xl overflow-hidden shadow-2xl">
        <div className="absolute inset-0 map-grid-overlay z-[400]" />
        
        <MapContainer 
          center={mapCenter} 
          zoom={17} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {filteredPlaces.map(place => (
            <Marker 
              key={place.id} 
              position={[place.lat, place.lng]}
              icon={place.id === 'hotel-fino' ? createCustomIcon('hotel', true) : createCustomIcon(place.category)}
              eventHandlers={{
                click: () => handlePlaceSelect(place),
              }}
            >
              <Popup>
                <div className="p-1 min-w-[180px]">
                  <img
                    src={place.image}
                    alt={place.name}
                    className="w-full h-24 object-cover rounded-md mb-2"
                  />
                  <h4 className="font-bold text-sm mb-1 text-white">{place.name}</h4>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                    <span className="text-xs font-black text-yellow-500">{place.rating}</span>
                    <span className="text-[10px] text-slate-400">({place.reviewCount} 則評價)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-medium mb-3">{place.description}</p>
                  
                  {place.website && (
                    <a 
                      href={place.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold mb-3 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={10} />
                      官方網站
                    </a>
                  )}

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-sky-400 font-bold mb-3 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={10} />
                    Google Maps 連結
                  </a>

                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => toggleFavorite(place.id, e)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5",
                        favorites.includes(place.id) ? "bg-red-500 border-red-500 text-white" : "border-white/20 text-slate-300"
                      )}
                    >
                      <Heart size={10} className={cn(favorites.includes(place.id) && "fill-current")} />
                      收藏
                    </button>
                    <button 
                      onClick={(e) => toggleItinerary(place.id, e)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5",
                        itinerary.includes(place.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-white/20 text-slate-300"
                      )}
                    >
                      <Calendar size={10} />
                      行程
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => selectRoutePoint('start', place, e)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                        routeStart?.id === place.id ? "bg-emerald-500 border-emerald-500 text-white" : "border-white/20 text-slate-300"
                      )}
                    >
                      設為起點
                    </button>
                    <button
                      onClick={(e) => selectRoutePoint('end', place, e)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                        routeEnd?.id === place.id ? "bg-rose-500 border-rose-500 text-white" : "border-white/20 text-slate-300"
                      )}
                    >
                      設為終點
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
          {itineraryRoutePath.length >= 2 && (
            <Polyline
              positions={itineraryRoutePath}
              pathOptions={{ color: '#22C55E', weight: 5, opacity: 0.8 }}
            />
          )}
          {routePath.length >= 2 && (
            <Polyline
              positions={routePath}
              pathOptions={{ color: '#6366F1', weight: 5, opacity: 0.85 }}
            />
          )}
          {routeStart && (
            <Marker position={[routeStart.lat, routeStart.lng]} icon={standardIcon}>
              <Popup>
                <div className="text-xs font-bold">起點：{routeStart.name}</div>
              </Popup>
            </Marker>
          )}
          {routeEnd && (
            <Marker position={[routeEnd.lat, routeEnd.lng]} icon={standardIcon}>
              <Popup>
                <div className="text-xs font-bold">終點：{routeEnd.name}</div>
              </Popup>
            </Marker>
          )}
          <MapFocusHandler center={mapCenter} />
        </MapContainer>

        {/* Special Highlight Info */}
        <div className="absolute bottom-10 left-10 z-[1000] group">
          <div className="glass-panel p-4 rounded-3xl shadow-2xl flex items-center gap-4 group-hover:border-indigo-500/50 transition-all duration-500 bg-slate-900/60">
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="absolute inset-0 bg-[#FBBF24] rounded-2xl opacity-20 animate-pulse group-hover:scale-110 transition-transform" />
              <div className="relative w-full h-full bg-[#1E293B] rounded-2xl flex items-center justify-center border border-white/10 shadow-inner group-hover:border-[#FBBF24]/50 transition-all">
                <MapPin className="w-5 h-5 text-[#FBBF24]" />
              </div>
            </div>
            <div className="flex flex-col">
              <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-0.5">推薦住處</p>
              <p className="text-xs font-bold text-white">Best Western Hotel Fino</p>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 underline cursor-pointer" onClick={() => {
                const hotel = SHINSAIBASHI_PLACES.find(p => p.id === 'hotel-fino');
                if (hotel) handlePlaceSelect(hotel);
              }}>在中心地圖預覽</p>
            </div>
            <div className="ml-4 h-8 w-[1px] bg-white/10" />
            <div className="flex flex-col items-center">
              <p className="text-[10px] font-black text-white leading-none">4.4</p>
              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500 mt-1" />
            </div>
          </div>
        </div>

        {/* Categories floating labels */}
        <div className="absolute top-20 left-6 z-[1000] flex flex-col gap-2">
          <div className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-xl border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EA4335] shadow-[0_0_10px_rgba(234,67,53,0.5)]"></div> 美食探索
          </div>
          <div className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-xl border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#4285F4] shadow-[0_0_10px_rgba(66,133,244,0.5)]"></div> 購物天堂
          </div>
          <div className="glass-panel px-4 py-2 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-300 shadow-xl border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#34A853] shadow-[0_0_10px_rgba(52,168,83,0.5)]"></div> 必訪景點
          </div>
        </div>

        <div className="absolute top-6 z-[1000] left-6">
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="glass-panel px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 border border-white/10 hover:bg-white/10 transition-all"
          >
            {isSidebarOpen ? '收合攻略面板' : '展開攻略面板'}
          </button>
        </div>

        {itineraryDetails.length >= 2 && (
          <div className="absolute top-20 right-6 z-[1000]">
            <div className="glass-panel px-4 py-3 rounded-2xl border border-white/10 bg-slate-900/75">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">多點行程路線</p>
              <p className="text-xs font-bold text-white mt-1">
                {isItineraryRouting
                  ? '計算中...'
                  : itineraryRouteDistance !== null
                    ? `總距離：${formatDistance(itineraryRouteDistance)}`
                    : '尚未取得路線'}
              </p>
              {itineraryRouteError && (
                <p className="text-[10px] text-amber-300 mt-1">{itineraryRouteError}</p>
              )}
            </div>
          </div>
        )}

        {/* Offline Overlay Status */}
        <div className="absolute bottom-4 right-4 z-[10001] pointer-events-none">
          <div className="flex items-center gap-2 bg-slate-900/90 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border border-white/10 shadow-2xl backdrop-blur-md">
            <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-pulse" />
            <span>地圖已就緒 • 支援離線瀏覽</span>
          </div>
        </div>
      </section>
    </div>
  );
}
