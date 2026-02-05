document.addEventListener("DOMContentLoaded", () => {
    const auctionList = document.getElementById("auction-list");
    if (!auctionList) return;

    const auctions = [
        { 
            title: "Antique Vase", 
            description: "A rare 19th-century porcelain piece with gold trim.", 
            currentBid: 12000, // Updated for Rupees
            image: "https://images.unsplash.com/photo-1695902047073-796e00ccd35f?q=80&w=769"
        },
        { 
            title: "Vintage Watch", 
            description: "Classic 1950s timepiece in original leather casing.", 
            currentBid: 45000, 
            image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=400"
        },
        { 
            title: "Art Painting", 
            description: "Original oil on canvas by a contemporary local artist.", 
            currentBid: 30000, 
            image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=400"
        },
        { 
            title: "Collector Coins", 
            description: "A set of mint-condition historical silver coins.", 
            currentBid: 8500, 
            image: "https://images.unsplash.com/photo-1635946680486-09420d25eb0b?q=80&w=1170"
        }
    ];

    auctionList.innerHTML = "";
    const isHomepage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";
    const displayList = isHomepage ? auctions.slice(0, 3) : auctions;

    displayList.forEach(auction => {
        const div = document.createElement("div");
        div.classList.add("auction-item");
        
        div.innerHTML = `
            <img src="${auction.image}" alt="${auction.title}" style="width:100%; height:200px; object-fit:cover; border-radius:4px; margin-bottom:15px;">
            <h3>${auction.title}</h3>
            <p>${auction.description}</p>
            <p><strong>Current Bid: ₹${auction.currentBid.toLocaleString('en-IN')}</strong></p>
            <a href="item-detail.html?item=${encodeURIComponent(auction.title)}" class="btn-primary">VIEW BID</a>
        `;
        auctionList.appendChild(div);
    });
});