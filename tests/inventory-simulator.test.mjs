import test from 'node:test';
import assert from 'node:assert/strict';
import {runInventorySimulationScenario} from '../inventory-simulator.js';

test('simulador aislado concilia central y las dos sucursales sin tocar Supabase',()=>{
 const state=runInventorySimulationScenario();
 assert.equal(state.kind,'SIMULATED_ONLY');
 assert.equal(state.insufficientRejected,true);
 assert.equal(state.balances['central:sim-pollo'],11);
 assert.equal(state.balances['mora:sim-pollo'],4.5);
 assert.equal(state.balances['santacruz:sim-pollo'],4);
 assert.equal(state.movements.length,6,'el reintento no duplica movimientos');
 assert.equal(state.balances['central:sim-pollo']+state.balances['mora:sim-pollo']+state.balances['santacruz:sim-pollo'],19.5);
});
