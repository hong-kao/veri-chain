import express from 'express';

const router = express.Router();

// Mock Data for Notifications
const MOCK_NOTIFICATIONS = [
    {
        id: 1,
        type: "success",
        title: "Claim Verified!",
        message: "Your claim #1234 has been verified. You earned 150 points!",
        time: "2h ago",
        read: false,
    },
    {
        id: 2,
        type: "rank",
        title: "Rank Update",
        message: "Congratulations! You moved up 5 ranks on the leaderboard.",
        time: "1d ago",
        read: false,
    },
    {
        id: 3,
        type: "pending",
        title: "Claim Processing",
        message: "Your claim #1235 is currently being analyzed.",
        time: "1d ago",
        read: true,
    },
];

// Mock Data for Leaderboard
const MOCK_LEADERBOARD = [
    { rank: 1, name: "Abinav", points: 3890, accuracy: 95, change: 2 },
    { rank: 2, name: "Shirrish", points: 2345, accuracy: 92, change: -1 },
    { rank: 3, name: "Ashrith", points: 2100, accuracy: 89, change: 1 },
    { rank: 4, name: "David", points: 1890, accuracy: 88, change: 3 },
    { rank: 5, name: "Eve", points: 1750, accuracy: 91, change: -1 },
    { rank: 43, name: "You", points: 1247, accuracy: 89, change: 5, isCurrentUser: true },
];

router.get('/notifications', (req, res) => {
    // In a real app, we would fetch from DB based on authenticated user
    res.json(MOCK_NOTIFICATIONS);
});

router.get('/leaderboard', (req, res) => {
    res.json(MOCK_LEADERBOARD);
});

export default router;
