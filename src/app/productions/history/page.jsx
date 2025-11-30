"use client"

import {useState, useEffect} from "react";
import {ToastContainer, toast} from "react-toastify";
import styles from "@/css/production.module.css";
import "react-toastify/dist/ReactToastify.css";

export default function History() {
    const getLocalDateString = () => {
        const date = new Date();
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    }

    const getPreviousMonthDate = () => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${year}-${month}-${day}`;
    }

    const INITIAL_FILTER_STATE = {
        fromDate: getPreviousMonthDate(),
        toDate: getLocalDateString(),
        product: ""
    };

    const [filterData, setFilterData] = useState(INITIAL_FILTER_STATE);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);

    const [totalStats, setTotalStats] = useState({
        totalMilk: 0,
        totalCurd: 0,
        totalPremiumPaneer: 0,
        totalSoftPaneer: 0,
        totalButter: 0,
        totalCream: 0,
        totalGhee: 0
    });

    useEffect(() => {
        fetchData();
    }, []);

    const handleFilterChange = (field, value) => {
        setFilterData(prev => ({
            ...prev, 
            [field] : value
        }));
    };

    async function fetchData() {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                fromDate: filterData.fromDate,
                toDate: filterData.toDate,
                product: filterData.product
            }).toString();

            const res = await fetch(`/api/production/history?${queryParams}`);
            const data = await res.json();
            
            if (res.ok) {
                setEntries(data);
                calculateTotal(data);
                toast.success(`Found ${data.length} entries`);
            } else {
                toast.error("Failed to fetch data");
            }
        } catch (error) {
            toast.error("Error fetching data");
        }
        setLoading(false);
    }

    function calculateTotal(data) {
        const stats = {
            totalMilk: 0,
            totalCurd: 0,
            totalPremiumPaneer: 0,
            totalSoftPaneer: 0,
            totalButter: 0,
            totalCream: 0,
            totalGhee: 0
        };

        data.forEach(entry => {
            stats.totalMilk += parseInt(entry.milk_quantity) || 0;//Int
            stats.totalCurd += parseFloat(entry.curd_quantity) || 0;
            stats.totalPremiumPaneer += parseFloat(entry.premium_paneer_quantity) || 0;
            stats.totalSoftPaneer += parseFloat(entry.soft_paneer_quantity) || 0;
            stats.totalButter += parseFloat(entry.butter_quantity) || 0;
            stats.totalCream += parseFloat(entry.cream_quantity) || 0;
            stats.totalGhee += parseFloat(entry.ghee_quantity) || 0;
        });

        setTotalStats(stats);
    }

    function downloadCSV() {
        if (entries.length === 0) {
            toast.warning("No data to export");
            return;
        }

        // CSV headers
        const headers = [
            'Date',
            'Batch',
            'Milk Quantity',
            'Curd Quantity',
            'Premium Paneer Quantity',
            'Soft Paneer Quantity',
            'Butter Quantity',
            'Cream Quantity',
            'Ghee Quantity',
            'Created At'
        ];

        // CSV data rows
        const csvData = entries.map(entry => [
            entry.date,
            entry.batch,
            entry.milk_quantity || '0',
            entry.curd_quantity || '0',
            entry.premium_paneer_quantity || '0',
            entry.soft_paneer_quantity || '0',
            entry.butter_quantity || '0',
            entry.cream_quantity || '0',
            entry.ghee_quantity || '0',
            new Date(entry.createdAt).toLocaleString('en-IN')
        ]);

        // Add total row
        csvData.push([
            'TOTAL',
            '',
            totalStats.totalMilk.toString(),
            totalStats.totalCurd.toString(),
            totalStats.totalPremiumPaneer.toString(),
            totalStats.totalSoftPaneer.toString(),
            totalStats.totalButter.toString(),
            totalStats.totalCream.toString(),
            totalStats.totalGhee.toString(),
            ''
        ]);

        // Convert to CSV string
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => row.join(','))
        ].join('\n');

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `production_history_${filterData.fromDate}_to_${filterData.toDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success("CSV file downloaded successfully");
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        fetchData();
    };

    return (
        <div className={styles.container}>
            <ToastContainer />
            <h1>Production History</h1>

            <form onSubmit={handleSubmit} className={styles.filterForm}>
                <div className={styles.filterRow}>
                    <div className={styles.inputGroup}>
                        <label>From:</label>
                        <input 
                            type="date" 
                            value={filterData.fromDate}
                            onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                            className={styles.input}
                        />
                    </div>
                    
                    <div className={styles.inputGroup}>
                        <label>To:</label>
                        <input 
                            type="date" 
                            value={filterData.toDate}
                            onChange={(e) => handleFilterChange('toDate', e.target.value)}
                            className={styles.input}
                        />
                    </div>
                    
                    <div className={styles.inputGroup}>
                        <label>Product:</label>
                        <select 
                            value={filterData.product}
                            onChange={(e) => handleFilterChange('product', e.target.value)}
                            className={styles.select}
                        >
                            <option value="">ALL</option>
                            <option value="milk">Milk</option>
                            <option value="curd">Curd</option>
                            <option value="premium_paneer">Premium Paneer</option>
                            <option value="soft_paneer">Soft Paneer</option>
                            <option value="butter">Butter</option>
                            <option value="cream">Cream</option>
                            <option value="ghee">Ghee</option>
                        </select>
                    </div>
                    
                    <button type="submit" disabled={loading} className={styles.submitBtn}>
                        {loading ? "Loading..." : "Show History"}
                    </button>
                </div>
            </form>

            {entries.length > 0 && (
                <div className={styles.statsCard}>
                    <h3>Total Production Summary</h3>
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Milk:</span>
                            <span className={styles.statValue}>{totalStats.totalMilk}L</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Curd:</span>
                            <span className={styles.statValue}>{totalStats.totalCurd}L</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Premium Paneer:</span>
                            <span className={styles.statValue}>{totalStats.totalPremiumPaneer}Kg</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Soft Paneer:</span>
                            <span className={styles.statValue}>{totalStats.totalSoftPaneer}Kg</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Butter:</span>
                            <span className={styles.statValue}>{totalStats.totalButter}Kg</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Cream:</span>
                            <span className={styles.statValue}>{totalStats.totalCream}L</span>
                        </div>
                        <div className={styles.statItem}>
                            <span className={styles.statLabel}>Ghee:</span>
                            <span className={styles.statValue}>{totalStats.totalGhee}L</span>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.exportSection}>
                <button 
                    onClick={downloadCSV} 
                    disabled={entries.length === 0}
                    className={styles.exportBtn}
                >
                    Download CSV
                </button>
                <span className={styles.entryCount}>
                    {entries.length} entries found
                </span>
            </div>

            <div className={styles.tableWrapper}>
                {loading ? (
                    <div className={styles.loading}>Loading production history...</div>
                ) : entries.length === 0 ? (
                    <div className={styles.emptyState}>
                        No production data found for the selected criteria
                    </div>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Batch</th>
                                <th>Milk</th>
                                <th>Curd</th>
                                <th>Premium Paneer</th>
                                <th>Soft Paneer</th>
                                <th>Butter</th>
                                <th>Cream</th>
                                <th>Ghee</th>
                                <th>Created At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <tr key={entry._id}>
                                    <td>{new Date(entry.date).toLocaleDateString('en-IN')}</td>
                                    <td>{entry.batch}</td>
                                    <td>{entry.milk_quantity || '0'}L</td>
                                    <td>{entry.curd_quantity || '0'}L</td>
                                    <td>{entry.premium_paneer_quantity || '0'}Kg</td>
                                    <td>{entry.soft_paneer_quantity || '0'}Kg</td>
                                    <td>{entry.butter_quantity || '0'}Kg</td>
                                    <td>{entry.cream_quantity || '0'}L</td>
                                    <td>{entry.ghee_quantity || '0'}L</td>
                                    <td>{new Date(entry.createdAt).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}