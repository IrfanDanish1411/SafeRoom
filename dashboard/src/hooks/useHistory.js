import { useState, useEffect } from 'react';

// API base URL - update with your backend server
const API_BASE = 'http://localhost:5000/api';

/**
 * Hook to fetch sensor history from MongoDB via REST API
 */
export function useSensorHistory(hours = 24, refreshInterval = 30000) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`${API_BASE}/sensors?hours=${hours}&limit=100`);
                if (!response.ok) throw new Error('Failed to fetch sensor data');
                const result = await response.json();
                setData(result);
                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, refreshInterval);
        return () => clearInterval(interval);
    }, [hours, refreshInterval]);

    return { data, loading, error };
}

/**
 * Hook to fetch alert history from MongoDB
 */
export function useAlertHistory(hours = 24) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`${API_BASE}/alerts?hours=${hours}`);
                if (response.ok) {
                    const result = await response.json();
                    setData(result);
                }
            } catch (err) {
                console.error('Failed to fetch alerts:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [hours]);

    return { data, loading };
}

/**
 * Hook to fetch statistics
 */
export function useStats(hours = 24) {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch(`${API_BASE}/stats?hours=${hours}`);
                if (response.ok) {
                    const result = await response.json();
                    setStats(result);
                }
            } catch (err) {
                console.error('Failed to fetch stats:', err);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, [hours]);

    return stats;
}
