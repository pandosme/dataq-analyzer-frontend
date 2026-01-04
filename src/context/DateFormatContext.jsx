import { createContext, useContext, useState, useEffect } from 'react';
import { configAPI } from '../services/api';

const DateFormatContext = createContext();

export const DateFormatProvider = ({ children }) => {
  const [dateFormat, setDateFormat] = useState('US');
  const [timeFormat, setTimeFormat] = useState('12h');
  const [timezone, setTimezone] = useState('America/New_York');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDateFormat = async () => {
      try {
        const response = await configAPI.getSystemConfig();
        if (response.success && response.data) {
          if (response.data.dateFormat) {
            setDateFormat(response.data.dateFormat);
          }
          if (response.data.timeFormat) {
            setTimeFormat(response.data.timeFormat);
          }
          if (response.data.timezone) {
            setTimezone(response.data.timezone);
          }
        }
      } catch (error) {
        // If no server selected or config endpoint doesn't exist, use default
        if (error.message?.includes('No server selected')) {
          console.log('No server selected yet, using default date format');
        } else {
          console.error('Failed to load date format:', error);
        }
      } finally {
        setLoading(false);
      }
    };
    loadDateFormat();
  }, []);

  const updateDateFormat = async (format) => {
    try {
      await configAPI.updateSystemConfig({ dateFormat: format });
      setDateFormat(format);
    } catch (error) {
      console.error('Failed to update date format:', error);
      throw error;
    }
  };

  const updateTimeFormat = async (format) => {
    try {
      await configAPI.updateSystemConfig({ timeFormat: format });
      setTimeFormat(format);
    } catch (error) {
      console.error('Failed to update time format:', error);
      throw error;
    }
  };

  return (
    <DateFormatContext.Provider value={{
      dateFormat,
      timeFormat,
      timezone,
      updateDateFormat,
      updateTimeFormat,
      loading
    }}>
      {children}
    </DateFormatContext.Provider>
  );
};

export const useDateFormat = () => {
  const context = useContext(DateFormatContext);
  if (!context) {
    throw new Error('useDateFormat must be used within a DateFormatProvider');
  }
  return context;
};
