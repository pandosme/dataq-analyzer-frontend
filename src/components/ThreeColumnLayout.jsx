import PropTypes from 'prop-types';
import './ThreeColumnLayout.css';

function ThreeColumnLayout({ leftPanel, middlePanel, rightPanel }) {
  return (
    <div className="three-column-layout">
      <aside className="left-panel">
        {leftPanel}
      </aside>
      <main className="middle-panel">
        {middlePanel}
      </main>
      <aside className="right-panel">
        {rightPanel}
      </aside>
    </div>
  );
}

ThreeColumnLayout.propTypes = {
  leftPanel: PropTypes.node,
  middlePanel: PropTypes.node,
  rightPanel: PropTypes.node,
};

export default ThreeColumnLayout;
