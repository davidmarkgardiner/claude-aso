import React from 'react';

const TestApp: React.FC = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-600">Platform UI Test</h1>
      <p className="mt-4 text-gray-600">If you can see this, the basic React app is working.</p>
      
      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold">Quick Test</h2>
        <ul className="mt-2 space-y-1">
          <li>✅ React is loading</li>
          <li>✅ Tailwind CSS is working</li>
          <li>✅ TypeScript is compiling</li>
        </ul>
      </div>
    </div>
  );
};

export default TestApp;