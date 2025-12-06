import React from 'react';
import './Loader.css';

interface LoaderProps {
    fullScreen?: boolean;
    text?: string;
    size?: 'small' | 'medium' | 'large';
}

const Loader: React.FC<LoaderProps> = ({ fullScreen = false, text, size = 'medium' }) => {
    const loaderContent = (
        <div className={`minimal-loader-container ${size}`}>
            <div className="minimal-spinner"></div>
            {text && <p className="minimal-loader-text">{text}</p>}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="minimal-loader-overlay">
                {loaderContent}
            </div>
        );
    }

    return loaderContent;
};

export default Loader;
