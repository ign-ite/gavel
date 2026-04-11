"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight, Gavel, Shield } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface ReelItem {
  id: string;
  title: string;
  price: number;
  verified: boolean;
  image: string;
  video?: string;
  category?: string;
  endTime?: string;
}

const shell = {
  bg: "linear-gradient(180deg, #384959 0%, #2f4559 38%, #253d2c 100%)",
  panel: "rgba(189, 221, 252, 0.1)",
  panelStrong: "rgba(207, 255, 220, 0.12)",
  border: "rgba(189, 221, 252, 0.18)",
  text: "#f6fbff",
  textSoft: "rgba(207, 255, 220, 0.82)",
  accent: "#88BDF2",
  accentSoft: "#BDDDFC",
  accentAlt: "#A3E0CA",
  gold: "#DFEFB2",
  deep: "#253D2C"
};

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);

  useEffect(() => {
    const fetchReels = async () => {
      const cacheKey = "gavel-landing-reels";
      const cachedReels = window.localStorage.getItem(cacheKey);
      if (cachedReels) {
        try {
          const validCached = normalizeReels(JSON.parse(cachedReels));
          if (validCached.length) {
            setReels(validCached);
            setIsLoading(false);
          } else {
            window.localStorage.removeItem(cacheKey);
          }
        } catch {
          window.localStorage.removeItem(cacheKey);
        }
      }

      try {
        const res = await fetch("/api/auctions");
        const data = await res.json();
        const nextReels = normalizeReels(
          data
            .filter((auction: any) => auction.status === "active")
            .map((auction: any) => ({
              id: auction.id,
              title: auction.title,
              price: Number(auction.currentBid || 0),
              verified: Boolean(auction.verified),
              image: auction.image || auction.images?.[0],
              video: auction.videoUrl || auction.verificationVideo || "",
              category: auction.category || "Uncategorized",
              endTime: auction.endTime
            }))
        );
        setReels(nextReels);
        window.localStorage.setItem(cacheKey, JSON.stringify(nextReels));
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch reels:", error);
        if (!cachedReels) setReels([]);
        setIsLoading(false);
      }
    };

    fetchReels();
  }, []);

  useEffect(() => {
    const fetchWatchlist = async () => {
      if (!user) {
        setWatchlistIds([]);
        return;
      }

      try {
        const res = await fetch("/api/watchlist");
        if (!res.ok) return;
        const data = await res.json();
        setWatchlistIds(data.map((item: any) => item.id));
      } catch (error) {
        console.error("Failed to fetch watchlist:", error);
      }
    };

    fetchWatchlist();
  }, [user]);

  useEffect(() => {
    if (!loading && user) {
      window.location.replace("/explore.html");
    }
  }, [loading, user]);

  useEffect(() => {
    if (!reels.length) {
      setActiveReelIndex(0);
      return;
    }
    if (activeReelIndex >= reels.length) {
      setActiveReelIndex(0);
    }
  }, [activeReelIndex, reels]);

  const currentReel = reels[activeReelIndex];
  const currentPrice = currentReel ? `₹${currentReel.price.toLocaleString("en-IN")}` : "";
  const currentTimeLeft = currentReel ? formatTimeLeft(currentReel.endTime) : "";

  if (!loading && user) return null;

  const handleWatchlistToggle = async (auctionId: string) => {
    if (!user) {
      window.location.assign("/login.html");
      return;
    }

    try {
      const res = await fetch("/api/watchlist/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: auctionId })
      });

      if (!res.ok) {
        if (res.status === 401) window.location.assign("/login.html");
        return;
      }

      const data = await res.json();
      if (data.success) {
        setWatchlistIds((prev) => data.added ? [...new Set([...prev, auctionId])] : prev.filter((id) => id !== auctionId));
      }
    } catch (error) {
      console.error("Failed to update watchlist:", error);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden md:pl-[18.5rem]" style={{ background: shell.bg, fontFamily: "var(--font-body)" }}>
      <nav
        className="fixed left-4 top-4 bottom-4 z-50 hidden w-56 flex-col rounded-[28px] p-4 md:flex"
        style={{ background: "rgba(56, 73, 89, 0.82)", backdropFilter: "blur(18px)", border: `1px solid ${shell.border}`, boxShadow: "0 18px 48px rgba(22, 31, 37, 0.28)" }}
      >
        <div className="mb-6 flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: "rgba(189, 221, 252, 0.12)" }}>
          <Gavel className="h-5 w-5" style={{ color: shell.accentSoft }} />
          <span className="text-lg font-bold tracking-[0.14em]" style={{ color: shell.text, fontFamily: "var(--font-heading)" }}>GAVEL</span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { href: "/auction.html", label: "Auctions" },
            { href: "/explore.html", label: "Explore" },
            { href: "/short-view.html", label: "Shorts" },
            { href: "/workspace/", label: "Workspace" },
            { href: "/sell-product.html", label: "Sell" }
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:translate-x-1"
              style={{ color: shell.textSoft, border: `1px solid rgba(189, 221, 252, 0.08)` }}
            >
              {item.label}
            </a>
          ))}
        </div>
        <div className="mt-auto">
          {!loading && user ? (
            <div className="space-y-3">
              <div className="rounded-2xl px-3 py-3" style={{ background: "rgba(189, 221, 252, 0.08)" }}>
                <div className="text-xs uppercase tracking-[0.24em]" style={{ color: shell.accentAlt }}>Logged In</div>
                <div className="mt-1 text-sm" style={{ color: shell.text }}>{user.name}</div>
              </div>
              <button
                onClick={logout}
                className="w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #BDDDFC 0%, #A3E0CA 100%)", color: shell.deep }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => window.location.assign("/signup.html")}
              className="w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, #BDDDFC 0%, #A3E0CA 100%)", color: shell.deep }}
            >
              Join Now
            </button>
          )}
        </div>
      </nav>

      <section className="px-4 pb-14 pt-8 sm:px-6 md:pt-10 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="order-2 space-y-6 lg:order-1"
            >
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em]" style={{ background: "rgba(207, 255, 220, 0.12)", color: shell.accentAlt, border: `1px solid ${shell.border}` }}>
                Seller-first marketplace
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl leading-[0.94] sm:text-5xl lg:text-7xl" style={{ color: shell.text, fontFamily: "var(--font-heading)", fontWeight: 600 }}>
                  Live auctions built for real listings and smoother trading.
                </h1>
                <p className="max-w-2xl text-base leading-7 sm:text-lg" style={{ color: shell.textSoft }}>
                  Browse approved inventory, save lots to your watchlist, and move from listing to bidding without the cluttered landing-page noise.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => window.location.assign("/auction.html")}
                  className="group inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, #88BDF2 0%, #A3E0CA 100%)", color: shell.deep, boxShadow: "0 16px 28px rgba(136, 189, 242, 0.18)" }}
                >
                  Explore Auctions
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => window.location.assign("/sell-product.html")}
                  className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold transition-transform hover:scale-[1.02]"
                  style={{ border: `1px solid ${shell.border}`, color: shell.text, background: "rgba(189, 221, 252, 0.08)" }}
                >
                  Sell On Gavel
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Live Preview", value: isLoading ? "Loading" : `${reels.length}` },
                  { label: "Categories", value: `${categories.length}` },
                  { label: "Marketplace", value: "Responsive" }
                ].map((item) => (
                  <div key={item.label} className="rounded-[22px] p-4" style={{ background: "rgba(189, 221, 252, 0.08)", border: `1px solid ${shell.border}` }}>
                    <div className="text-xs uppercase tracking-[0.22em]" style={{ color: shell.accentAlt }}>{item.label}</div>
                    <div className="mt-2 text-2xl" style={{ color: shell.text, fontFamily: "var(--font-heading)" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 34, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
              className="order-1 lg:order-2"
            >
              <div className="rounded-[34px] p-3 shadow-2xl" style={{ background: "linear-gradient(180deg, rgba(189, 221, 252, 0.18) 0%, rgba(207, 255, 220, 0.1) 100%)", border: `1px solid ${shell.border}` }}>
                <div className="overflow-hidden rounded-[28px]" style={{ background: "rgba(37, 61, 44, 0.72)", border: "1px solid rgba(189, 221, 252, 0.12)" }}>
                  <div className="flex items-center justify-between px-4 py-3 sm:px-5" style={{ background: "rgba(189, 221, 252, 0.08)", borderBottom: "1px solid rgba(189, 221, 252, 0.12)" }}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E491A6" }} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#DFEFB2" }} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#68BA7F" }} />
                    </div>
                    <div className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: "rgba(189, 221, 252, 0.1)", color: shell.accentSoft }}>
                      Marketplace Preview
                    </div>
                  </div>

                  <div className="relative aspect-[4/5] w-full sm:aspect-[16/12]">
                    {isLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: shell.accentSoft, borderTopColor: "transparent" }} />
                      </div>
                    ) : currentReel ? (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentReel.id}
                          initial={{ opacity: 0, scale: 1.04 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.985 }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className="absolute inset-0"
                        >
                          {currentReel.video ? (
                            <video src={currentReel.video} poster={currentReel.image} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            <img src={currentReel.image} alt={currentReel.title} className="absolute inset-0 h-full w-full object-cover" />
                          )}
                          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(37, 61, 44, 0.1) 0%, rgba(37, 61, 44, 0.86) 92%)" }} />
                          <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-5 sm:right-5">
                            <div className="flex flex-wrap items-center gap-2">
                              {currentReel.verified ? (
                                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: "rgba(207, 255, 220, 0.12)", color: shell.accentAlt }}>
                                  <Shield className="h-3.5 w-3.5" />
                                  Verified
                                </span>
                              ) : null}
                              <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ background: "rgba(189, 221, 252, 0.12)", color: shell.accentSoft }}>
                                {currentReel.category}
                              </span>
                            </div>
                            <button
                              onClick={() => handleWatchlistToggle(currentReel.id)}
                              className="rounded-full p-3 transition-transform hover:scale-105"
                              style={{ background: watchlistIds.includes(currentReel.id) ? "rgba(163, 224, 202, 0.22)" : "rgba(189, 221, 252, 0.12)" }}
                              aria-label="Toggle watchlist"
                            >
                              <Bookmark className="h-5 w-5" style={{ color: watchlistIds.includes(currentReel.id) ? shell.gold : shell.accentSoft, fill: watchlistIds.includes(currentReel.id) ? shell.gold : "transparent" }} />
                            </button>
                          </div>

                          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                            <div className="rounded-[26px] p-4 sm:p-5" style={{ background: "rgba(56, 73, 89, 0.62)", border: "1px solid rgba(189, 221, 252, 0.16)", backdropFilter: "blur(18px)" }}>
                              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                                <div>
                                  <h2 className="text-2xl leading-tight sm:text-3xl" style={{ color: shell.text, fontFamily: "var(--font-heading)", fontWeight: 600 }}>
                                    {currentReel.title}
                                  </h2>
                                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: shell.textSoft }}>
                                    <span style={{ color: shell.gold, fontFamily: "var(--font-heading)", fontSize: "1.4rem" }}>{currentPrice}</span>
                                    <span>{currentTimeLeft}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => window.location.assign(`/item-detail.html?id=${currentReel.id}`)}
                                  className="rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:scale-[1.02]"
                                  style={{ background: "linear-gradient(135deg, #BDDDFC 0%, #DFEFB2 100%)", color: shell.deep }}
                                >
                                  Open Listing
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="flex h-full items-center justify-center px-8 text-center text-base leading-7" style={{ color: shell.textSoft }}>
                        No live auctions yet. Approved seller listings will appear here automatically.
                      </div>
                    )}

                    {reels.length > 1 ? (
                      <>
                        <button
                          onClick={() => setActiveReelIndex((prev) => (prev - 1 + reels.length) % reels.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-3 transition-transform hover:scale-110 sm:left-4"
                          style={{ background: "rgba(56, 73, 89, 0.68)", border: `1px solid ${shell.border}` }}
                        >
                          <ChevronLeft className="h-5 w-5" style={{ color: shell.accentSoft }} />
                        </button>
                        <button
                          onClick={() => setActiveReelIndex((prev) => (prev + 1) % reels.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-3 transition-transform hover:scale-110 sm:right-4"
                          style={{ background: "rgba(56, 73, 89, 0.68)", border: `1px solid ${shell.border}` }}
                        >
                          <ChevronRight className="h-5 w-5" style={{ color: shell.accentSoft }} />
                        </button>
                      </>
                    ) : null}

                    {reels.length > 1 ? (
                      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-1.5">
                        {reels.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveReelIndex(idx)}
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: idx === activeReelIndex ? 26 : 8, background: idx === activeReelIndex ? shell.accentSoft : "rgba(189, 221, 252, 0.3)" }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="discover" className="px-4 py-14 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.36em]" style={{ color: shell.accentAlt }}>
              Categories
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl" style={{ color: shell.text, fontFamily: "var(--font-heading)", fontWeight: 600 }}>
              Explore By Category
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => window.location.assign(`/auction.html?category=${encodeURIComponent(cat.name)}`)}
                className="group relative overflow-hidden rounded-[24px] text-left transition-transform duration-200 hover:-translate-y-1"
                style={{ aspectRatio: "3 / 4", border: `1px solid ${shell.border}` }}
              >
                <Image src={cat.image} alt={cat.name} fill className="object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(56, 73, 89, 0.06) 0%, rgba(37, 61, 44, 0.84) 100%)" }} />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="rounded-[18px] px-4 py-3" style={{ background: "rgba(56, 73, 89, 0.58)", border: "1px solid rgba(189, 221, 252, 0.12)", backdropFilter: "blur(16px)" }}>
                    <h3 className="text-lg sm:text-xl" style={{ color: shell.text, fontFamily: "var(--font-heading)", fontWeight: 600 }}>
                      {cat.name}
                    </h3>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-4 py-10 sm:px-6 lg:px-10" style={{ borderTop: `1px solid ${shell.border}`, background: "rgba(56, 73, 89, 0.34)" }}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 md:flex-row">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5" style={{ color: shell.accentSoft }} />
            <span className="text-lg tracking-[0.12em]" style={{ color: shell.text, fontFamily: "var(--font-heading)" }}>GAVEL</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-[0.22em]">
            <a href="/auction.html" style={{ color: shell.textSoft }}>Auctions</a>
            <a href="/sell-product.html" style={{ color: shell.textSoft }}>Sell</a>
            <a href="/workspace/" style={{ color: shell.textSoft }}>Workspace</a>
            <a href="/terms-and-conditions.html" style={{ color: shell.textSoft }}>Terms &amp; Conditions</a>
          </div>
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: shell.textSoft }}>© 2026 Gavel</p>
        </div>
      </footer>
    </main>
  );
}

const categories = [
  { name: "Electronics", image: "/images/product-headphones.png" },
  { name: "Vehicles", image: "/images/product-laptop.png" },
  { name: "Real Estate", image: "/images/sell-hero.png" },
  { name: "Collectibles", image: "/images/auction-hero.png" },
  { name: "Fashion", image: "/images/product-sneakers.png" },
  { name: "Art", image: "/images/auction-products.png" },
  { name: "Jewellery", image: "/images/hero-gavel.png" },
  { name: "Antiques", image: "/images/logo.png" }
];

function normalizeReels(rows: any[]): ReelItem[] {
  return (Array.isArray(rows) ? rows : [])
    .map((item: any) => ({
      id: String(item.id || ""),
      title: String(item.title || "Untitled listing"),
      price: Number(item.price || 0),
      verified: Boolean(item.verified),
      image: item.image || "/images/logo.png",
      video: item.video || "",
      category: item.category || "Uncategorized",
      endTime: item.endTime
    }))
    .filter((item) => item.id && (item.image || item.video));
}

function formatTimeLeft(endTime?: string) {
  if (!endTime) return "Closing time unavailable";
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Closing soon";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  return `${hours}h ${minutes}m left`;
}
