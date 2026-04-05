"use client";
import React, { useState, useEffect } from "react";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import Image from "next/image";
import { 
  Gavel, Shield, Clock, Award, Heart, MessageCircle, Bookmark, 
  ChevronLeft, ChevronRight, Sparkles, Crown, Gem, ArrowRight, Lock, Star, Zap
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/*
 * GAVEL LANDING PAGE - ENHANCED VERSION
 * Color Palette:
 * #1A3263 - Dark Blue (primary dark)
 * #547792 - Teal (primary accent)
 * #EFD2B0 - Mint (secondary accent)
 * #FFC570 - Light Yellow (highlight)
 */

const REELS_API_ENDPOINT = "/api/reels";

interface ReelItem {
  id: string;
  title: string;
  price: string;
  timeLeft: string;
  likes: string;
  comments: string;
  verified: boolean;
  live: boolean;
  image: string;
}

export default function Home() {
  const { user, loading, login, logout } = useAuth();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const fetchReels = async () => {
      try {
        const res = await fetch('/api/auctions');
        const data = await res.json();
        const activeAuctions = data.filter((a: any) => a.status === 'active').map((a: any) => ({
          id: a.id,
          title: a.title,
          price: `₹${a.currentBid.toLocaleString('en-IN')}`,
          timeLeft: "LIVE", // Simplified for marquee
          likes: `${Math.floor(Math.random() * 500)}`,
          comments: `${Math.floor(Math.random() * 50)}`,
          verified: true,
          live: true,
          image: a.image || a.images?.[0]
        }));
        setReels(activeAuctions.length > 0 ? activeAuctions : demoReels);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch reels:", error);
        setReels(demoReels);
        setIsLoading(false);
      }
    };
    fetchReels();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      
      // Hide ticker when scrolling down, show when scrolling up
      if (currentScrollY > 50) {
        setTickerVisible(false);
      } else {
        setTickerVisible(true);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const nextReel = () => setActiveReelIndex((prev) => (prev + 1) % reels.length);
  const prevReel = () => setActiveReelIndex((prev) => (prev - 1 + reels.length) % reels.length);

  return (
    <main className="min-h-screen overflow-x-hidden" style={{ background: "linear-gradient(180deg, #1A3263 0%, #547792 50%, #EFD2B0 100%)", fontFamily: "var(--font-montserrat)" }}>
      {/* LIVE AUCTION TICKER - Disappears on scroll */}
      <div 
        className={`fixed top-24 left-0 right-0 z-40 py-2 overflow-hidden transition-all duration-500 ease-out ${
          tickerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
        }`}
        style={{ background: "rgba(84, 119, 146, 0.15)", borderBottom: "1px solid rgba(239, 210, 176, 0.3)" }}
      >
        <div className="flex animate-marquee whitespace-nowrap">
          {[...demoLiveBids, ...demoLiveBids].map((bid, idx) => (
            <div key={idx} className="flex items-center gap-3 mx-8">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#EFD2B0" }} />
              <span className="text-xs" style={{ color: "rgba(237, 247, 189, 0.9)" }}>
                <span style={{ color: "#EFD2B0", fontWeight: 600 }}>{bid.item}</span> — Bid <span style={{ color: "#FFC570" }}>{bid.amount}</span> by <span style={{ color: "#547792" }}>{bid.bidder}</span> ({bid.timeAgo} ago)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-2 py-2 rounded-full" style={{ background: "rgba(26, 50, 99, 0.9)", backdropFilter: "blur(20px)", border: "1px solid rgba(239, 210, 176, 0.3)", boxShadow: "0 8px 32px rgba(26, 50, 99, 0.5)" }}>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: "rgba(239, 210, 176, 0.2)" }}>
            <Gavel className="w-5 h-5" style={{ color: "#EFD2B0" }} />
            <span className="text-lg font-bold text-white" style={{ fontFamily: "var(--font-gravitas)", letterSpacing: "0.1em" }}>GAVEL</span>
          </div>
          <div className="hidden md:flex items-center gap-1 px-2">
            <a href="/auction.html" className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-300" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 210, 176, 0.2)"; e.currentTarget.style.color = "#EFD2B0"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FFC570"; }}>Auctions</a>
            <a href="/explore.html" className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-300" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 210, 176, 0.2)"; e.currentTarget.style.color = "#EFD2B0"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FFC570"; }}>Explore</a>
            <a href="/short-view.html" className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-300" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 210, 176, 0.2)"; e.currentTarget.style.color = "#EFD2B0"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FFC570"; }}>Shorts</a>
            <a href="/sell-product.html" className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-300" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 210, 176, 0.2)"; e.currentTarget.style.color = "#EFD2B0"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FFC570"; }}>Sell</a>
          </div>
          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm px-3" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }}>
                  {user.name}
                </span>
                <button onClick={logout} className="px-4 py-2 rounded-full font-semibold text-sm transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)" }}>Logout</button>
              </div>
            ) : (
              <button onClick={() => window.location.href = '/login.html'} className="px-5 py-2 rounded-full font-semibold text-sm transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)" }}>Join Now</button>
            )
          )}
        </div>
      </nav>

      {/* HERO - HIGHER POSITION */}
      <section className="pt-16 pb-8 relative">
        <div className="relative z-10">
          <ContainerScroll
            titleComponent={
              <div className="space-y-3 px-4 -mt-12">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mx-auto" style={{ background: "rgba(239, 210, 176, 0.15)", border: "1px solid rgba(239, 210, 176, 0.3)" }}>
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#EFD2B0" }} />
                  <span className="text-[10px] font-semibold tracking-[0.3em] uppercase" style={{ color: "#EFD2B0", fontFamily: "var(--font-montserrat)" }}>Established 2026</span>
                </div>
                <div className="space-y-1">
                  <h1 className="text-4xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[0.08em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>WHERE</h1>
                  <h1 className="text-4xl md:text-6xl lg:text-7xl leading-[0.95] tracking-[0.08em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400, color: "#EFD2B0" }}>LEGACY</h1>
                  <h1 className="text-4xl md:text-6xl lg:text-7xl text-white leading-[0.95] tracking-[0.08em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>MEETS LUXURY</h1>
                </div>
                <p className="text-lg md:text-xl max-w-lg mx-auto pt-2" style={{ color: "#547792", fontFamily: "var(--font-gravitas)", fontWeight: 400, letterSpacing: "0.05em" }}>Curated auctions for the discerning collector</p>
                <p className="text-sm max-w-md mx-auto" style={{ color: "rgba(237, 247, 189, 0.9)", fontFamily: "var(--font-montserrat)", fontSize: "1.05rem" }}>Experience the worlds most prestigious marketplace for fine art, timepieces, and rare collectibles. Every piece authenticated. Every bid matters.</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <button onClick={() => window.location.href = '/auction.html'} className="group px-8 py-3.5 rounded-full font-semibold text-sm transition-all hover:scale-105 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)", boxShadow: "0 4px 20px rgba(239, 210, 176, 0.4)" }}>Explore Collection<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></button>
                  <button onClick={() => window.location.href = '/auction.html'} className="px-8 py-3.5 rounded-full font-semibold text-sm transition-all hover:scale-105" style={{ background: "transparent", border: "1px solid rgba(239, 210, 176, 0.5)", color: "#EFD2B0", fontFamily: "var(--font-montserrat)" }}>View Live Auctions</button>
                </div>
                <div className="flex items-center justify-center gap-6 pt-2 text-xs" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }}>
                  <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" style={{ color: "#EFD2B0" }} />Verified Authentic</span>
                  <span className="w-1 h-1 rounded-full bg-[#547792]" />
                  <span className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" style={{ color: "#EFD2B0" }} />White Glove Service</span>
                  <span className="w-1 h-1 rounded-full bg-[#547792]" />
                  <span className="flex items-center gap-1.5"><Gem className="w-3.5 h-3.5" style={{ color: "#EFD2B0" }} />Global Shipping</span>
                </div>
              </div>
            }
          >
            <div className="relative w-full h-full overflow-hidden rounded-2xl" style={{ background: "#1A3263" }}>
              {isLoading ? (
                <div className="flex items-center justify-center h-full"><div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#EFD2B0", borderTopColor: "transparent" }} /></div>
              ) : reels.length > 0 ? (
                <div className="relative w-full h-full">
                  <Image src={reels[activeReelIndex].image} alt={reels[activeReelIndex].title} fill className="object-cover" priority />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26, 50, 99, 0.95) 0%, rgba(84, 119, 146, 0.4) 50%, transparent 100%)" }} />
                  {reels[activeReelIndex].live && <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(239, 210, 176, 0.95)" }}><span className="w-2 h-2 bg-white rounded-full animate-pulse" /><span className="text-white text-xs font-bold tracking-wider" style={{ fontFamily: "var(--font-montserrat)" }}>LIVE</span></div>}
                  <div className="absolute bottom-0 left-0 p-6 w-full">
                    <div className="flex items-end justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-1 rounded tracking-wider" style={{ background: "rgba(239, 210, 176, 0.25)", color: "#EFD2B0", fontFamily: "var(--font-montserrat)" }}>LOT {reels[activeReelIndex].id}</span>
                          {reels[activeReelIndex].verified && <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded tracking-wider" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)" }}><Shield className="w-3 h-3" /> VERIFIED</span>}
                        </div>
                        <h3 className="text-lg md:text-xl text-white mb-1 tracking-wide" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>{reels[activeReelIndex].title}</h3>
                        <p className="text-xl md:text-2xl tracking-wider" style={{ color: "#EFD2B0", fontFamily: "var(--font-gravitas)", fontWeight: 500 }}>{reels[activeReelIndex].price}</p>
                        <p className="text-xs mt-2 tracking-wider" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>ENDS IN {reels[activeReelIndex].timeLeft}</p>
                      </div>
                      <div className="flex flex-col items-center gap-3 ml-4">
                        <button className="flex flex-col items-center gap-1" style={{ color: "white" }}><div className="p-2.5 rounded-full" style={{ background: "rgba(239, 210, 176, 0.2)" }}><Heart className="w-5 h-5" style={{ color: "#EFD2B0" }} /></div><span className="text-[10px] tracking-wider" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }}>{reels[activeReelIndex].likes}</span></button>
                        <button className="flex flex-col items-center gap-1" style={{ color: "white" }}><div className="p-2.5 rounded-full" style={{ background: "rgba(239, 210, 176, 0.2)" }}><Bookmark className="w-5 h-5" style={{ color: "#EFD2B0" }} /></div></button>
                      </div>
                    </div>
                    <button className="w-full mt-4 py-3 rounded-full font-semibold text-sm tracking-wider transition-all hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)", boxShadow: "0 4px 20px rgba(239, 210, 176, 0.4)" }}>PLACE BID</button>
                  </div>
                  <button onClick={prevReel} className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-all hover:scale-110" style={{ background: "rgba(26, 50, 99, 0.85)", backdropFilter: "blur(10px)", border: "1px solid rgba(239, 210, 176, 0.3)" }}><ChevronLeft className="w-5 h-5" style={{ color: "#EFD2B0" }} /></button>
                  <button onClick={nextReel} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full transition-all hover:scale-110" style={{ background: "rgba(26, 50, 99, 0.85)", backdropFilter: "blur(10px)", border: "1px solid rgba(239, 210, 176, 0.3)" }}><ChevronRight className="w-5 h-5" style={{ color: "#EFD2B0" }} /></button>
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {reels.map((_, idx) => <button key={idx} onClick={() => setActiveReelIndex(idx)} className="h-1 rounded-full transition-all" style={{ background: idx === activeReelIndex ? "#EFD2B0" : "rgba(239, 210, 176, 0.3)", width: idx === activeReelIndex ? "24px" : "6px" }} />)}
                  </div>
                </div>
              ) : <div className="flex items-center justify-center h-full" style={{ color: "#FFC570", fontFamily: "var(--font-montserrat)" }}>No reels available</div>}
            </div>
          </ContainerScroll>
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="discover" className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[10px] font-semibold tracking-[0.4em] uppercase" style={{ color: "#EFD2B0", fontFamily: "var(--font-montserrat)" }}>Curated Collections</span>
            <h2 className="text-3xl md:text-4xl text-white mt-3 tracking-[0.06em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>Discover by Category</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((cat, idx) => (
              <div key={idx} className="group relative overflow-hidden rounded-xl cursor-pointer transition-transform hover:-translate-y-1" style={{ aspectRatio: "3/4" }}>
                <Image src={cat.image} alt={cat.name} fill className="object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26, 50, 99, 0.95) 0%, transparent 60%)" }} />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="text-lg tracking-wider text-white" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>{cat.name}</h3>
                  <p className="text-xs mt-1" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>{cat.count} items</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REELS MARQUEE SECTION - NEW HIGHER DENSITY */}
      <section className="py-20 border-y" style={{ background: "rgba(26, 50, 99, 0.4)", borderColor: "rgba(239, 210, 176, 0.15)" }}>
        <div className="px-6 mb-12 text-center">
          <span className="text-[10px] font-semibold tracking-[0.4em] uppercase" style={{ color: "#EFD2B0", fontFamily: "var(--font-montserrat)" }}>Watch It Live</span>
          <h2 className="text-3xl md:text-5xl text-white mt-3 tracking-[0.06em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400 }}>Trending Discovery</h2>
          <p className="text-sm mt-4 max-w-xl mx-auto" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>High-velocity luxury auctions happening right now. Experience the thrill of real-time bidding.</p>
        </div>

        <div className="reels-marquee-container">
          <div className="reels-marquee-track">
            {/* Double the list for infinite scroll effect */}
            {[...reels, ...reels, ...reels, ...reels].map((reel, idx) => (
              <div key={idx} className="marquee-item px-2">
                <div 
                  className="short-card relative aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer border border-white/5 bg-black"
                  onClick={() => window.location.href = `/short-view.html?id=${reel.id}`}
                >
                  <Image src={reel.image} alt={reel.title} fill className="object-cover opacity-80" />
                  {reel.live && <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-600/90 backdrop-blur-sm"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /><span className="text-[8px] font-bold text-white tracking-widest">LIVE</span></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-4">
                    <p className="text-[10px] font-bold text-white mb-0.5 truncate">{reel.title}</p>
                    <p className="text-xs font-black text-[#FFC570]">{reel.price}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* EXCLUSIVE ACCESS - FULLSCREEN */}
      <section className="min-h-screen relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1A3263 0%, #547792 50%, #EFD2B0 100%" }}>
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-0 right-0 w-full h-full" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(239, 210, 176, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(84, 119, 146, 0.25) 0%, transparent 50%)" }} />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="mb-8">
            <div className="w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center" style={{ background: "rgba(239, 210, 176, 0.2)", border: "2px solid rgba(239, 210, 176, 0.4)" }}>
              <Lock className="w-12 h-12" style={{ color: "#EFD2B0" }} />
            </div>
            <h2 className="text-5xl md:text-7xl mb-6 tracking-[0.05em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 400, color: "#EFD2B0" }}>Exclusive Access</h2>
            <p className="text-xl max-w-2xl mx-auto mb-12" style={{ color: "rgba(237, 247, 189, 0.9)", fontFamily: "var(--font-montserrat)", fontSize: "1.1rem" }}>
              Join our invite-only auctions featuring the world's rarest collectibles. Limited to 100 new members per month.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            {[
              { icon: <Star className="w-6 h-6" />, title: "Invite-Only", desc: "Private auctions" },
              { icon: <Crown className="w-6 h-6" />, title: "VIP Concierge", desc: "Personal service" },
              { icon: <Zap className="w-6 h-6" />, title: "Early Access", desc: "Preview lots" },
              { icon: <Gem className="w-6 h-6" />, title: "Private Sales", desc: "Direct deals" }
            ].map((benefit, idx) => (
              <div key={idx} className="p-6 rounded-2xl" style={{ background: "rgba(26, 50, 99, 0.6)", border: "1px solid rgba(239, 210, 176, 0.25)" }}>
                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(239, 210, 176, 0.2)", color: "#EFD2B0" }}>{benefit.icon}</div>
                <h3 className="text-sm font-medium mb-1" style={{ color: "#EFD2B0", fontFamily: "var(--font-gravitas)" }}>{benefit.title}</h3>
                <p className="text-xs" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>{benefit.desc}</p>
              </div>
            ))}
          </div>

          <button onClick={() => window.location.href = '/signup.html'} className="px-12 py-5 rounded-full font-semibold text-lg tracking-wider transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #EFD2B0 0%, #547792 100%)", color: "#1A3263", fontFamily: "var(--font-montserrat)", boxShadow: "0 10px 40px rgba(239, 210, 176, 0.4)" }}>
            Request Membership
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 px-6" style={{ borderTop: "1px solid rgba(239, 210, 176, 0.2)", background: "rgba(26, 50, 99, 0.3)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Gavel className="w-5 h-5" style={{ color: "#EFD2B0" }} />
              <span className="text-lg text-white tracking-[0.1em]" style={{ fontFamily: "var(--font-gravitas)", fontWeight: 500 }}>GAVEL</span>
            </div>
            <div className="flex gap-8">
              {["About", "Auctions", "Sell", "Contact"].map((link) => {
                const target = link === "Auctions" ? "/auction.html" : link === "Sell" ? "/sell-product.html" : "#";
                return <a key={link} href={target} className="text-xs tracking-wider transition-colors hover:text-white" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>{link}</a>;
              })}
            </div>
            <p className="text-xs tracking-wider" style={{ color: "#547792", fontFamily: "var(--font-montserrat)" }}>© 2026 Gavel. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

const demoReels: ReelItem[] = [
  { id: "042", title: "1962 Rolex Daytona", price: "₹1.25 Crore", timeLeft: "14h 22m", likes: "2.4k", comments: "156", verified: true, live: true, image: "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=800&q=80" },
  { id: "057", title: "Mercedes-Benz 300 SL", price: "₹2.45 Crore", timeLeft: "9h 45m", likes: "3.2k", comments: "234", verified: true, live: true, image: "https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&q=80" },
  { id: "031", title: "Hermès Birkin 25", price: "₹1.8 Crore", timeLeft: "1d 11h", likes: "5.1k", comments: "412", verified: true, live: false, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80" },
  { id: "095", title: "Patek Philippe", price: "₹68 Lakh", timeLeft: "18h 30m", likes: "3.5k", comments: "289", verified: true, live: true, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80" },
];

const categories = [
  { name: "Timepieces", count: "240", image: "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=400&q=80" },
  { name: "Fine Art", count: "186", image: "https://images.unsplash.com/photo-1577083552431-6e5fd01988ec?w=400&q=80" },
  { name: "Automobiles", count: "42", image: "https://images.unsplash.com/photo-1563720223185-11003d516935?w=400&q=80" },
  { name: "Handbags", count: "95", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&q=80" },
];

const trustFeatures = [
  { icon: <Shield className="w-5 h-5" />, title: "Authentication", description: "Every piece verified by certified experts with comprehensive documentation." },
  { icon: <Crown className="w-5 h-5" />, title: "White Glove", description: "End-to-end concierge service handling shipping, insurance, and delivery." },
  { icon: <Gem className="w-5 h-5" />, title: "Global Reach", description: "Connect with collectors worldwide through our secure bidding platform." }
];

const demoLiveBids = [
  { id: "1", item: "Rolex Submariner", bidder: "Collector_89", amount: "₹12,40,000", timeAgo: "12s", location: "Mumbai" },
  { id: "2", item: "Hermès Birkin 30", bidder: "LuxuryQueen", amount: "₹8,90,000", timeAgo: "28s", location: "Delhi" },
  { id: "3", item: "Porsche 911 Turbo", bidder: "AutoKing", amount: "₹1,45,00,000", timeAgo: "45s", location: "Bangalore" },
  { id: "4", item: "Cartier Diamond Ring", bidder: "JewelHunter", amount: "₹22,50,000", timeAgo: "1m", location: "Dubai" },
  { id: "5", item: "Vintage Patek Philippe", bidder: "TimeMaster", amount: "₹95,00,000", timeAgo: "2m", location: "Singapore" },
];

const stats = [
  { value: "98%", label: "SATISFACTION" },
  { value: "50K+", label: "ITEMS SOLD" },
  { value: "₹500Cr", label: "AUCTION VALUE" },
  { value: "24/7", label: "SUPPORT" }
];

const steps = [
  { title: "Register", description: "Create your account and complete verification to start bidding on exclusive items." },
  { title: "Bid", description: "Place bids in real-time or set maximum proxy bids for seamless participation." },
  { title: "Collect", description: "Win your item and receive it with our white-glove delivery service." }
];
