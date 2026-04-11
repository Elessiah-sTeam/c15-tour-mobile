import { registerRootComponent } from 'expo';
import React from 'react';
import HomeScreen from '../screens/HomeScreen';

const App = () => {
  return <HomeScreen />;
};

registerRootComponent(App);
export default App;