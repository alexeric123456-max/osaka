import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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
  X,
  Plus,
  Trash2,
  Navigation,
  ExternalLink,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SHINSAIBASHI_PLACES, type Place } from './data';
import { cn } from './lib/utils';
import { getPlaceReviewSummary } from './services/geminiService';

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

export default function App() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
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

  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [dismissedReviews, setDismissedReviews] = useState<Set<string>>(new Set());

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
      const matchesSearch = place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           place.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

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

  const handlePlaceSelect = async (place: Place) => {
    setSelectedPlace(place);
    setMapCenter([place.lat, place.lng]);
    
    if (!aiSummaries[place.id]) {
      const summary = await getPlaceReviewSummary(place.name);
      setAiSummaries(prev => ({ ...prev, [place.id]: summary }));
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] font-sans text-[#E2E8F0] overflow-hidden p-4 gap-4">
      {/* Sidebar - Control Panel */}
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
      </aside>

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
                </div>
              </Popup>
            </Marker>
          ))}
          <MapFocusHandler center={mapCenter} />
        </MapContainer>

        {/* Floating AI Review Badge */}
        <AnimatePresence>
          {selectedPlace && aiSummaries[selectedPlace.id] && !dismissedReviews.has(selectedPlace.id) && (
            <motion.div
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="absolute top-6 right-6 z-[1000] w-72"
            >
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-5 backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/20 rounded-full blur-3xl" />
                
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                      <Star className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">AI 旅客短評</span>
                  </div>
                  <button 
                    onClick={() => {
                      setDismissedReviews(prev => new Set(prev).add(selectedPlace.id));
                    }}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>
                
                <p className="text-sm font-medium leading-relaxed italic text-indigo-100 mb-5 relative z-10">
                  「{aiSummaries[selectedPlace.id]}」
                </p>
                
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 bg-white/5 p-2 rounded-2xl border border-white/5">
                    <img src={selectedPlace.image} className="w-12 h-12 rounded-xl object-cover border border-white/10" alt="" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        {selectedPlace.category === 'food' ? '美食' : selectedPlace.category === 'shop' ? '商店' : '景點'}
                      </span>
                      <span className="text-xs font-bold text-white leading-tight mt-0.5">{selectedPlace.name}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => toggleFavorite(selectedPlace.id, e)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                        favorites.includes(selectedPlace.id)
                          ? "bg-red-500 border-red-500 text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)]"
                          : "border-white/10 text-slate-300 hover:bg-white/5"
                      )}
                    >
                      <Heart className={cn("w-3.5 h-3.5", favorites.includes(selectedPlace.id) && "fill-current")} />
                      {favorites.includes(selectedPlace.id) ? "已收藏" : "加入我的足跡"}
                    </button>
                    {selectedPlace.website && (
                      <a 
                        href={selectedPlace.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 text-slate-300 hover:bg-white/5 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        官方連結
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-2">
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
