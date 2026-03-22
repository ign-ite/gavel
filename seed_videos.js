require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gavel';

// Free stock vertical video clips (Pixabay CDN - all royalty-free)
const products = [
    { title: 'Gold Chronograph Watch', category: 'Jewellery', starting_price: 45000, current_bid: 48000, seller_email: 'luxwatch@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/12/184852-874229676_tiny.mp4', image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=400' },
    { title: 'Vintage Polaroid Camera', category: 'Electronics', starting_price: 8000, current_bid: 9500, seller_email: 'retro@gavel.io', video_url: 'https://cdn.pixabay.com/video/2021/10/24/94548-644788094_tiny.mp4', image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400' },
    { title: 'Designer Sunglasses', category: 'Fashion', starting_price: 12000, current_bid: 14000, seller_email: 'fashion@gavel.io', video_url: 'https://cdn.pixabay.com/video/2019/11/14/29333-375836262_tiny.mp4', image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400' },
    { title: 'Abstract Oil Painting', category: 'Art', starting_price: 25000, current_bid: 28000, seller_email: 'artist@gavel.io', video_url: 'https://cdn.pixabay.com/video/2020/05/16/40114-428615967_tiny.mp4', image: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400' },
    { title: 'Limited Edition Sneakers', category: 'Fashion', starting_price: 18000, current_bid: 22000, seller_email: 'kicks@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/12/10/192780-893708573_tiny.mp4', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400' },
    { title: 'Noise Cancelling Headphones', category: 'Electronics', starting_price: 15000, current_bid: 16500, seller_email: 'audio@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/06/15/167232-835694217_tiny.mp4', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400' },
    { title: 'Ceramic Art Vase', category: 'Antiques', starting_price: 6000, current_bid: 7200, seller_email: 'pottery@gavel.io', video_url: 'https://cdn.pixabay.com/video/2022/10/25/136450-764953682_tiny.mp4', image: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=400' },
    { title: 'Mechanical Keyboard Custom', category: 'Electronics', starting_price: 9000, current_bid: 11000, seller_email: 'tech@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/30/187309-881373562_tiny.mp4', image: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=400' },
    { title: 'Handmade Leather Bag', category: 'Fashion', starting_price: 7000, current_bid: 8500, seller_email: 'leather@gavel.io', video_url: 'https://cdn.pixabay.com/video/2019/11/14/29333-375836262_tiny.mp4', image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400' },
    { title: 'Racing Drone Pro', category: 'Electronics', starting_price: 35000, current_bid: 38000, seller_email: 'drones@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/30/187309-881373562_tiny.mp4', image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400' },
    { title: 'Vintage Wine Collection', category: 'Collectibles', starting_price: 60000, current_bid: 65000, seller_email: 'wine@gavel.io', video_url: 'https://cdn.pixabay.com/video/2022/10/25/136450-764953682_tiny.mp4', image: 'https://images.unsplash.com/photo-1474722883778-792e7990302f?w=400' },
    { title: 'Signed Basketball Jersey', category: 'Collectibles', starting_price: 20000, current_bid: 24000, seller_email: 'sports@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/06/15/167232-835694217_tiny.mp4', image: 'https://images.unsplash.com/photo-1515459961680-58cf6d8e0dff?w=400' },
    { title: 'Diamond Stud Earrings', category: 'Jewellery', starting_price: 55000, current_bid: 58000, seller_email: 'diamonds@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/12/184852-874229676_tiny.mp4', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=400' },
    { title: 'Electric Guitar Fender', category: 'Collectibles', starting_price: 40000, current_bid: 43000, seller_email: 'music@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/12/10/192780-893708573_tiny.mp4', image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400' },
    { title: 'Antique Brass Compass', category: 'Antiques', starting_price: 3000, current_bid: 4200, seller_email: 'explorer@gavel.io', video_url: 'https://cdn.pixabay.com/video/2021/10/24/94548-644788094_tiny.mp4', image: 'https://images.unsplash.com/photo-1504275107627-0c2ba7a43dba?w=400' },
    { title: 'Smart Home Speaker', category: 'Electronics', starting_price: 5000, current_bid: 6000, seller_email: 'smart@gavel.io', video_url: 'https://cdn.pixabay.com/video/2020/05/16/40114-428615967_tiny.mp4', image: 'https://images.unsplash.com/photo-1543512214-318c7553f230?w=400' },
    { title: 'Titanium Ring Set', category: 'Jewellery', starting_price: 18000, current_bid: 20000, seller_email: 'rings@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/12/184852-874229676_tiny.mp4', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400' },
    { title: 'Luxury Perfume Set', category: 'Fashion', starting_price: 10000, current_bid: 12500, seller_email: 'scent@gavel.io', video_url: 'https://cdn.pixabay.com/video/2019/11/14/29333-375836262_tiny.mp4', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400' },
    { title: 'Wooden Chess Set', category: 'Antiques', starting_price: 4000, current_bid: 5500, seller_email: 'games@gavel.io', video_url: 'https://cdn.pixabay.com/video/2022/10/25/136450-764953682_tiny.mp4', image: 'https://images.unsplash.com/photo-1586165368502-1bad197a6461?w=400' },
    { title: 'VR Headset Pro', category: 'Electronics', starting_price: 30000, current_bid: 32000, seller_email: 'vr@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/10/30/187309-881373562_tiny.mp4', image: 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=400' },
    { title: 'Silk Scarf Hermès Style', category: 'Fashion', starting_price: 8000, current_bid: 9800, seller_email: 'silk@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/12/10/192780-893708573_tiny.mp4', image: 'https://images.unsplash.com/photo-1601924994987-69e26d50dc64?w=400' },
    { title: 'Bronze Sculpture', category: 'Art', starting_price: 35000, current_bid: 37000, seller_email: 'sculptor@gavel.io', video_url: 'https://cdn.pixabay.com/video/2020/05/16/40114-428615967_tiny.mp4', image: 'https://images.unsplash.com/photo-1561839561-b13bcfe95249?w=400' },
    { title: 'Rare Stamp Collection', category: 'Collectibles', starting_price: 15000, current_bid: 17000, seller_email: 'stamps@gavel.io', video_url: 'https://cdn.pixabay.com/video/2021/10/24/94548-644788094_tiny.mp4', image: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=400' },
    { title: 'Carbon Fiber Wallet', category: 'Fashion', starting_price: 2500, current_bid: 3200, seller_email: 'minimal@gavel.io', video_url: 'https://cdn.pixabay.com/video/2023/06/15/167232-835694217_tiny.mp4', image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400' },
];

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to DB');
        const Auction = require('./models/Auction');

        console.log(`Inserting ${products.length} video products...`);
        for (const p of products) {
            await Auction.create({
                ...p,
                end_time: new Date(Date.now() + (Math.floor(Math.random() * 7) + 1) * 24 * 60 * 60 * 1000),
                status: 'active',
                verified: true
            });
        }

        console.log(`✅ Successfully seeded ${products.length} video auction shorts!`);
        process.exit(0);
    })
    .catch(err => { console.error(err); process.exit(1); });
