const fs = require('fs');
const path = require('path');

function compileContracts() {
  console.log('🔎 Checking Tolk contract entry points (this does not compile contracts)...\n');

  const contractsDir = path.join(__dirname, '..', 'contracts');
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.tolk'));

  files.forEach(file => {
    const filePath = path.join(contractsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('fun onInternalMessage')) {
      console.log(`✅ ${file} -> Entry point found`);
    } else {
      console.warn(`⚠️ ${file} -> Notice: Contract missing entry point`);
    }
  });

  console.log('\nℹ️ No BOC artifacts were produced. Run `acton build` for compilation.');
}

compileContracts();
