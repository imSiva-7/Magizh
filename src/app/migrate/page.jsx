"use client";

import { useState } from "react";
import styles from "@/css/admin.module.css";

export default function MigratePage() {
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/migrate/employee-attendance');
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      alert('Error checking status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    if (!confirm('Are you sure you want to migrate all employees?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/migrate/employee-attendance', {
        method: 'POST'
      });
      const data = await res.json();
      setResult(data);
      
      if (data.success) {
        alert(`✅ Success! Migrated ${data.migrated} employee(s)`);
        checkStatus(); // Refresh status
      } else {
        alert('❌ Migration failed: ' + data.error);
      }
    } catch (error) {
      alert('Error running migration: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Employee Attendance Migration</h1>
      
      <div style={{ 
        background: 'white', 
        padding: '2rem', 
        borderRadius: '1rem',
        maxWidth: '800px',
        margin: '2rem auto'
      }}>
        <h2>Migration Tool</h2>
        <p>This will add <code>attendance: {"{}"}</code> and <code>advances: {"{}"}</code> fields to all employees.</p>
        
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <button 
            onClick={checkStatus}
            disabled={loading}
            style={{
              padding: '1rem 2rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600'
            }}
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
          
          <button 
            onClick={runMigration}
            disabled={loading || (status && !status.needMigration)}
            style={{
              padding: '1rem 2rem',
              background: loading || (status && !status.needMigration) ? '#9ca3af' : 'rgb(39, 121, 93)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: loading || (status && !status.needMigration) ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '600'
            }}
          >
            {loading ? 'Migrating...' : 'Run Migration'}
          </button>
        </div>

        {status && (
          <div style={{ 
            marginTop: '2rem', 
            padding: '1.5rem', 
            background: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <h3>Status:</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li>📊 Total Employees: <strong>{status.totalEmployees}</strong></li>
              <li>✅ Already Migrated: <strong>{status.employeesWithFields}</strong></li>
              <li>⏳ Need Migration: <strong style={{ color: status.employeesNeedingMigration > 0 ? 'red' : 'green' }}>
                {status.employeesNeedingMigration}
              </strong></li>
            </ul>
            <p style={{ 
              marginTop: '1rem', 
              padding: '0.75rem',
              background: status.needMigration ? '#fef2f2' : '#f0fdf4',
              borderRadius: '0.375rem',
              color: status.needMigration ? '#991b1b' : '#166534'
            }}>
              {status.message}
            </p>
          </div>
        )}

        {result && result.success && (
          <div style={{ 
            marginTop: '2rem', 
            padding: '1.5rem', 
            background: '#f0fdf4',
            borderRadius: '0.5rem',
            border: '2px solid #86efac'
          }}>
            <h3 style={{ color: '#166534' }}>✅ Migration Successful!</h3>
            <p>Migrated <strong>{result.migrated}</strong> employee(s)</p>
            
            {result.employees && result.employees.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Migrated Employees:</h4>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  marginTop: '0.5rem'
                }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #e2e8f0' }}>Emp ID</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', border: '1px solid #e2e8f0' }}>Name</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>Attendance</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>Advances</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.employees.map((emp, index) => (
                      <tr key={index}>
                        <td style={{ padding: '0.5rem', border: '1px solid #e2e8f0' }}>{emp.empID}</td>
                        <td style={{ padding: '0.5rem', border: '1px solid #e2e8f0' }}>{emp.name}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                          {emp.hasAttendance ? '✅' : '❌'}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                          {emp.hasAdvances ? '✅' : '❌'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {result && !result.success && (
          <div style={{ 
            marginTop: '2rem', 
            padding: '1.5rem', 
            background: '#fef2f2',
            borderRadius: '0.5rem',
            border: '2px solid #fecaca'
          }}>
            <h3 style={{ color: '#991b1b' }}>❌ Migration Failed</h3>
            <p>{result.error}</p>
            {result.details && <pre style={{ fontSize: '0.875rem' }}>{result.details}</pre>}
          </div>
        )}
      </div>
    </div>
  );
}
