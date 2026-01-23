'use client';

import { useState } from 'react';
import styles from './SearchInput.module.css';

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchInput({ 
  onSearch, 
  placeholder = "Search for topics, guests, or moments...",
  autoFocus = false 
}: SearchInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleSearchClick = () => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.searchForm}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={styles.searchInput}
          autoFocus={autoFocus}
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
            }}
            className={styles.clearButton}
            aria-label="Clear search"
          >
            <span className="material-icons">close</span>
          </button>
        ) : (
          <button
            type="submit"
            onClick={handleSearchClick}
            className={styles.submitButton}
            aria-label="Search"
          >
            <span className="material-icons">search</span>
          </button>
        )}
      </div>
    </form>
  );
}
