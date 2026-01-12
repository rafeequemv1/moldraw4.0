import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';

function App() {
  const viewer3DRef = useRef(null);
  const viewerInstanceRef = useRef(null);
  const viewerBgRef = useRef({ color: '#f8f9fa', alpha: 1 });
  const iframeRef = useRef(null);
  const [is3DReady, setIs3DReady] = useState(false);
  const [isKetcherReady, setIsKetcherReady] = useState(false);
  const [showHydrogens, setShowHydrogens] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [renderStyle, setRenderStyle] = useState('ball-stick');
  const [currentMolecule, setCurrentMolecule] = useState(null);
  const lastMoleculeRef = useRef(null);
  const [moleculeName, setMoleculeName] = useState('');
  const [isNaming, setIsNaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [is3DPanelOpen, setIs3DPanelOpen] = useState(true);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // Initialize IndexedDB for caching
  useEffect(() => {
    const initDB = async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('MolDrawCache', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('appState')) {
            db.createObjectStore('appState', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('molecules')) {
            db.createObjectStore('molecules', { keyPath: 'id' });
          }
        };
      });
    };

    // Load cached state
    const loadCachedState = async () => {
      try {
        // Try localStorage first (faster)
        const cachedState = localStorage.getItem('moldraw_state');
        if (cachedState) {
          const state = JSON.parse(cachedState);
          if (state.renderStyle) setRenderStyle(state.renderStyle);
          if (state.showHydrogens !== undefined) setShowHydrogens(state.showHydrogens);
          if (state.is3DPanelOpen !== undefined) setIs3DPanelOpen(state.is3DPanelOpen);
        }

        // Initialize IndexedDB
        await initDB();
      } catch (error) {
        console.warn('Cache initialization failed:', error);
      }
    };

    loadCachedState();
  }, []);

  // Save state to cache
  useEffect(() => {
    const state = {
      renderStyle,
      showHydrogens,
      is3DPanelOpen,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('moldraw_state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }, [renderStyle, showHydrogens, is3DPanelOpen]);

  // Cache molecule data in IndexedDB
  const cacheMolecule = useCallback(async (molfile, smiles) => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('MolDrawCache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const transaction = db.transaction(['molecules'], 'readwrite');
      const store = transaction.objectStore('molecules');
      
      await store.put({
        id: 'current',
        molfile,
        smiles,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('Failed to cache molecule:', error);
    }
  }, []);

  // Initialize 3Dmol viewer
  useEffect(() => {
    const init3DViewer = async () => {
      try {
        const $3Dmol = window.$3Dmol;
        if (!$3Dmol) {
          console.error('3Dmol not loaded');
          return;
        }

        if (viewer3DRef.current && !viewerInstanceRef.current) {
          const config = { backgroundColor: '#f8f9fa' };
          const viewer = $3Dmol.createViewer(viewer3DRef.current, config);
          // Keep track of the intended background so we can restore it after exports
          viewerBgRef.current = { color: '#f8f9fa', alpha: 1 };
          viewerInstanceRef.current = viewer;
          setIs3DReady(true);

          viewer.addLabel('Draw a structure → see in 3D',
            {
              position: { x: 0, y: 0, z: 0 },
              fontSize: 16,
              fontColor: '#999',
              backgroundColor: 'transparent'
            });
          viewer.render();
        }
      } catch (error) {
        console.error('Error initializing 3D viewer:', error);
      }
    };

    if (!window.$3Dmol) {
      const script = document.createElement('script');
      script.src = 'https://3Dmol.csb.pitt.edu/build/3Dmol-min.js';
      script.async = true;
      script.onload = () => {
        setTimeout(init3DViewer, 100);
      };
      document.head.appendChild(script);
    } else {
      init3DViewer();
    }
  }, []);

  // Search molecule by name and load into Ketcher
  const searchMoleculeByName = async (moleculeName) => {
    if (!moleculeName || moleculeName.trim() === '') {
      setSearchError('Please enter a molecule name');
      return;
    }

    try {
      setIsSearching(true);
      setSearchError('');

      console.log('Searching for:', moleculeName);

      // PubChem API - get SMILES from compound name
      const encodedName = encodeURIComponent(moleculeName.trim());
      const apiUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodedName}/property/IsomericSMILES/JSON`;

      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0]) {
          const smiles = data.PropertyTable.Properties[0].IsomericSMILES || data.PropertyTable.Properties[0].SMILES;

          console.log('Got SMILES:', smiles);
          console.log('Ketcher ready:', isKetcherReady);

          // Load SMILES into Ketcher
          if (iframeRef.current && isKetcherReady) {
            console.log('Sending set-molecule message to Ketcher');
            iframeRef.current.contentWindow.postMessage({
              type: 'set-molecule',
              smiles: smiles
            }, '*');

            setSearchQuery('');
            setSearchError('');
          } else {
            setSearchError('Editor not ready. Please try again.');
          }
        } else {
          setSearchError(`"${moleculeName}" not found in PubChem`);
        }
      } else {
        setSearchError(`"${moleculeName}" not found in PubChem`);
      }

      setIsSearching(false);
    } catch (error) {
      console.error('Error searching molecule:', error);
      setSearchError('Search failed. Please try again.');
      setIsSearching(false);
    }
  };

  // Get molecule name from PubChem
  const getMoleculeName = async (smiles) => {
    if (!smiles || smiles.trim() === '') {
      setMoleculeName('');
      return;
    }

    try {
      setIsNaming(true);

      // URL encode SMILES
      const encodedSmiles = encodeURIComponent(smiles);

      // PubChem REST API - get compound by SMILES
      const apiUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/property/IUPACName,Title/JSON`;

      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0]) {
          const compound = data.PropertyTable.Properties[0];
          const name = compound.Title || compound.IUPACName || 'Unknown compound';
          setMoleculeName(name);
        } else {
          setMoleculeName('Not found in PubChem');
        }
      } else {
        setMoleculeName('Not found in PubChem');
      }

      setIsNaming(false);
    } catch (error) {
      console.error('Error getting molecule name:', error);
      setMoleculeName('Name lookup failed');
      setIsNaming(false);
    }
  };

  // Convert SMILES to 3D structure
  const convertSmilesTo3D = async (smiles) => {
    if (!smiles || smiles.trim() === '') {
      return null;
    }

    try {
      setIsConverting(true);

      const encodedSmiles = encodeURIComponent(smiles);
      const apiUrl = `https://cactus.nci.nih.gov/chemical/structure/${encodedSmiles}/file?format=sdf&get3d=true`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error('Failed to convert to 3D structure');
      }

      const sdf3D = await response.text();
      setIsConverting(false);

      return sdf3D;
    } catch (error) {
      console.error('Error converting to 3D:', error);
      setIsConverting(false);
      return null;
    }
  };

  // Apply render style to molecule
  const applyRenderStyle = useCallback((viewer, style) => {
    if (!viewer) return;

    const vdwScale = {
      'H': 0.20, 'C': 0.28, 'N': 0.27, 'O': 0.26,
      'S': 0.32, 'P': 0.32, 'F': 0.25, 'Cl': 0.30,
      'Br': 0.34, 'I': 0.36
    };

    // Clear existing styles
    viewer.setStyle({}, {});

    switch (style) {
      case 'ball-stick':
        // Elegant ball and stick with reflective materials
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !showHydrogens;
          viewer.setStyle({ elem: elem }, {
            stick: {
              radius: 0.12,
              colorscheme: 'Jmol',
              hidden: shouldHide
            },
            sphere: {
              scale: vdwScale[elem],
              colorscheme: 'Jmol',
              hidden: shouldHide
            }
          });
        });
        break;

      case 'stick':
        // Thin stick representation
        viewer.setStyle({}, {
          stick: {
            radius: 0.18,
            colorscheme: 'Jmol'
          }
        });
        if (!showHydrogens) {
          viewer.setStyle({ elem: 'H' }, { stick: { hidden: true } });
        }
        break;

      case 'sphere':
        // Space-filling spheres
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !showHydrogens;
          viewer.setStyle({ elem: elem }, {
            sphere: {
              scale: vdwScale[elem] * 1.8,
              colorscheme: 'Jmol',
              hidden: shouldHide
            }
          });
        });
        break;

      case 'line':
        // Simple line representation
        viewer.setStyle({}, {
          line: {
            linewidth: 2,
            colorscheme: 'Jmol'
          }
        });
        if (!showHydrogens) {
          viewer.setStyle({ elem: 'H' }, { line: { hidden: true } });
        }
        break;

      default:
        // Default ball-stick
        Object.keys(vdwScale).forEach(elem => {
          viewer.setStyle({ elem: elem }, {
            stick: { radius: 0.12, colorscheme: 'Jmol' },
            sphere: { scale: vdwScale[elem], colorscheme: 'Jmol' }
          });
        });
    }
  }, [showHydrogens]);

  // Update 3D viewer with molecule
  const updateMolecule3D = useCallback(async (molfile, smiles) => {
    if (!viewerInstanceRef.current) return;

    try {
      const viewer = viewerInstanceRef.current;
      viewer.clear();

      // Get molecule name from PubChem
      if (smiles && smiles.trim() !== '') {
        getMoleculeName(smiles);
      }

      // Get 3D structure
      let structure3D = null;
      if (smiles && smiles.trim() !== '') {
        structure3D = await convertSmilesTo3D(smiles);
      }

      const structureData = structure3D || molfile;
      const format = structure3D ? 'sdf' : 'mol';

      const lines = structureData.split('\n');
      const countsLine = lines.find(line => line.trim().match(/^\s*\d+\s+\d+/));

      if (countsLine) {
        const parts = countsLine.trim().split(/\s+/);
        const atomCount = parseInt(parts[0]) || 0;

        if (atomCount > 0) {
          viewer.addModel(structureData, format);

          // Store current molecule for export
          setCurrentMolecule({ data: structureData, format: format });

          // Cache molecule
          if (smiles) {
            cacheMolecule(structureData, smiles);
          }

          // Apply selected render style
          applyRenderStyle(viewer, renderStyle);

          // Center and rotate for 3D view
          viewer.zoomTo();
          viewer.rotate(25, { x: 1, y: 1, z: 0 });
          viewer.render();
        } else {
          viewer.addLabel('Draw a structure → see in 3D', {
            position: { x: 0, y: 0, z: 0 },
            fontSize: 16,
            fontColor: '#999',
            backgroundColor: 'transparent'
          });
          viewer.render();
          setCurrentMolecule(null);
          setMoleculeName('');
        }
      }
    } catch (error) {
      console.error('Error updating 3D molecule:', error);
    }
  }, [renderStyle, applyRenderStyle, cacheMolecule]);

  // Re-apply style when it changes
  useEffect(() => {
    if (viewerInstanceRef.current && currentMolecule) {
      applyRenderStyle(viewerInstanceRef.current, renderStyle);
      viewerInstanceRef.current.render();
    }
  }, [renderStyle, showHydrogens, applyRenderStyle, currentMolecule]);

  // Request molecule update
  const requestMoleculeUpdate = useCallback(() => {
    if (iframeRef.current && isKetcherReady) {
      iframeRef.current.contentWindow.postMessage({ type: 'get-molfile' }, '*');
    }
  }, [isKetcherReady]);

  // Listen for Ketcher messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'ketcher-ready') {
        setIsKetcherReady(true);
        console.log('Ketcher 3.7.0 is ready');
      } else if (event.data.type === 'molfile-response') {
        const newMolfile = event.data.molfile;

        // Only update if molecule changed
        if (newMolfile !== lastMoleculeRef.current) {
          lastMoleculeRef.current = newMolfile;

          if (iframeRef.current && isKetcherReady) {
            iframeRef.current.contentWindow.postMessage({ type: 'get-smiles' }, '*');
          }
          window.tempMolfile = newMolfile;
        }
      } else if (event.data.type === 'smiles-response') {
        const molfile = window.tempMolfile;
        const smiles = event.data.smiles;
        updateMolecule3D(molfile, smiles);
        delete window.tempMolfile;
      } else if (event.data.type === 'molecule-set') {
        console.log('Molecule set in Ketcher:', event.data);
        if (event.data.success) {
          // Trigger update after molecule is set
          setTimeout(() => {
            requestMoleculeUpdate();
          }, 500);
        } else {
          setSearchError('Failed to load molecule into editor');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isKetcherReady, updateMolecule3D, requestMoleculeUpdate]);

  // Smart polling - only check every 5 seconds (reduced from 3)
  useEffect(() => {
    if (isKetcherReady && is3DReady) {
      const interval = setInterval(requestMoleculeUpdate, 5000);
      return () => clearInterval(interval);
    }
  }, [isKetcherReady, is3DReady, requestMoleculeUpdate]);

  // Toggle hydrogens
  const toggleHydrogens = () => {
    setShowHydrogens(!showHydrogens);
  };

  // Export 3D model
  const exportModel = (format) => {
    if (!viewerInstanceRef.current || !currentMolecule) {
      alert('No molecule to export');
      return;
    }

    const viewer = viewerInstanceRef.current;
    let exportData = '';
    let filename = 'molecule';
    let mimeType = 'text/plain';

    switch (format) {
      case 'png':
        // Export as PNG with transparent background
        const { color: bgColor, alpha: bgAlpha } = viewerBgRef.current;
        viewer.setBackgroundColor(0xffffff, 0); // Set transparent
        viewer.render();
        const canvas = viewer.getCanvas();
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'molecule.png';
          link.click();
          URL.revokeObjectURL(url);
          // Restore original background
          viewer.setBackgroundColor(bgColor, bgAlpha);
          viewer.render();
        }, 'image/png');
        return;

      case 'pdb':
        exportData = viewer.pdbData || currentMolecule.data;
        filename = 'molecule.pdb';
        mimeType = 'chemical/x-pdb';
        break;

      case 'sdf':
        exportData = currentMolecule.data;
        filename = 'molecule.sdf';
        mimeType = 'chemical/x-mdl-sdfile';
        break;

      case 'xyz':
        exportData = convertToXYZ(currentMolecule.data);
        filename = 'molecule.xyz';
        mimeType = 'chemical/x-xyz';
        break;

      case 'obj':
        exportData = convertToOBJ(viewer);
        filename = 'molecule.obj';
        mimeType = 'model/obj';
        break;

      case 'x3d':
        exportData = convertToX3D(viewer);
        filename = 'molecule.x3d';
        mimeType = 'model/x3d+xml';
        break;

      default:
        exportData = currentMolecule.data;
        filename = 'molecule.mol';
    }

    // Create download link
    const blob = new Blob([exportData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper: Convert to XYZ format
  const convertToXYZ = (sdfData) => {
    const lines = sdfData.split('\n');
    const atoms = [];
    let inAtomBlock = false;

    for (let line of lines) {
      if (line.trim().match(/^\s*\d+\s+\d+/)) {
        inAtomBlock = true;
        continue;
      }
      if (inAtomBlock && line.trim().length > 30) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          atoms.push({
            x: parseFloat(parts[0]),
            y: parseFloat(parts[1]),
            z: parseFloat(parts[2]),
            elem: parts[3]
          });
        }
      }
      if (line.includes('M  END')) break;
    }

    let xyz = `${atoms.length}\nMolecule exported from Ketcher\n`;
    atoms.forEach(atom => {
      xyz += `${atom.elem} ${atom.x} ${atom.y} ${atom.z}\n`;
    });
    return xyz;
  };

  // Helper: Convert to OBJ format with properties and geometry
  const convertToOBJ = (viewer) => {
    const model = viewer.getModel(0);
    if (!model) return '';

    // Get all atoms from the model
    let atoms = model.selectedAtoms({});

    // Filter hydrogens if hidden
    if (!showHydrogens) {
      atoms = atoms.filter(a => a.elem !== 'H');
    }

    const atomMap = new Map();
    atoms.forEach((atom, idx) => {
      atomMap.set(atom.index !== undefined ? atom.index : idx, atom);
    });

    let outputVertices = [];
    let outputNormals = [];
    let outputFaces = [];
    let vertexOffset = 1;

    // Helper to rotate a point by a matrix/quaternion logic
    const rotatePoint = (point, axis, angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const t = 1 - c;
      const x = point.x, y = point.y, z = point.z;
      const u = axis.x, v = axis.y, w = axis.z;

      const newX = (u * u * t + c) * x + (u * v * t - w * s) * y + (u * w * t + v * s) * z;
      const newY = (v * u * t + w * s) * x + (v * v * t + c) * y + (v * w * t - u * s) * z;
      const newZ = (w * u * t - v * s) * x + (w * v * t + u * s) * y + (w * w * t + c) * z;

      return { x: newX, y: newY, z: newZ };
    };

    // 1. Generate Sphere Mesh for Atoms
    const generateSphere = (cx, cy, cz, radius, atomElem) => {
      const latBands = 8;
      const longBands = 8;
      const startV = vertexOffset;

      for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let long = 0; long <= longBands; long++) {
          const phi = long * 2 * Math.PI / longBands;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          const x = cosPhi * sinTheta;
          const y = cosTheta;
          const z = sinPhi * sinTheta;

          outputVertices.push({
            x: cx + radius * x,
            y: cy + radius * y,
            z: cz + radius * z
          });
          outputNormals.push({ x, y, z });
        }
      }

      for (let lat = 0; lat < latBands; lat++) {
        for (let long = 0; long < longBands; long++) {
          const first = (lat * (longBands + 1)) + long + startV;
          const second = first + longBands + 1;
          outputFaces.push([first, second, first + 1]);
          outputFaces.push([second, second + 1, first + 1]);
        }
      }
      vertexOffset += outputVertices.length - (startV - 1);
    };

    // 2. Generate Cylinder Mesh for Bonds
    const generateCylinder = (start, end, radius) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const height = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const bondVector = { x: dx, y: dy, z: dz };
      const yAxis = { x: 0, y: 1, z: 0 };

      const cross = {
        x: yAxis.y * bondVector.z - yAxis.z * bondVector.y,
        y: yAxis.z * bondVector.x - yAxis.x * bondVector.z,
        z: yAxis.x * bondVector.y - yAxis.y * bondVector.x
      };
      let crossLen = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);

      let angle = 0;
      let axis = { x: 1, y: 0, z: 0 };

      if (crossLen > 0.0001) {
        axis.x = cross.x / crossLen;
        axis.y = cross.y / crossLen;
        axis.z = cross.z / crossLen;
        const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
        angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      } else {
        const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
        if (dot < 0) {
          axis = { x: 1, y: 0, z: 0 };
          angle = Math.PI;
        }
      }

      const radialSegments = 6;
      const startV = vertexOffset;
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const midZ = (start.z + end.z) / 2;

      for (let i = 0; i <= radialSegments; i++) {
        const theta = i * 2 * Math.PI / radialSegments;
        const x = radius * Math.cos(theta);
        const z = radius * Math.sin(theta);
        const vTop = { x: x, y: height / 2, z: z };
        const vBot = { x: x, y: -height / 2, z: z };
        const rTop = rotatePoint(vTop, axis, angle);
        const rBot = rotatePoint(vBot, axis, angle);

        outputVertices.push({ x: rTop.x + midX, y: rTop.y + midY, z: rTop.z + midZ });
        outputVertices.push({ x: rBot.x + midX, y: rBot.y + midY, z: rBot.z + midZ });
      }

      for (let i = 0; i < radialSegments; i++) {
        const base = startV + i * 2;
        const top1 = base;
        const bot1 = base + 1;
        const top2 = base + 2;
        const bot2 = base + 3;

        outputFaces.push([top1, bot1, top2]);
        outputFaces.push([bot1, bot2, top2]);
      }
      vertexOffset += outputVertices.length - (startV - 1);
    };

    // GENERATE GEOMETRY
    atoms.forEach((atom) => {
      const radius = getAtomRadius(atom.elem);
      generateSphere(atom.x, atom.y, atom.z, radius, atom.elem);
    });

    const processedBonds = new Set();
    atoms.forEach((atom1) => {
      if (!atom1.bonds) return;
      atom1.bonds.forEach((neighborIndex, i) => {
        let atom2 = atomMap.get(neighborIndex);
        if (!atom2 && neighborIndex < atoms.length) atom2 = atoms[neighborIndex];
        if (!atom2) return;

        // If hydrogens are hidden, don't draw bonds to/from them
        if (!showHydrogens && (atom1.elem === 'H' || atom2.elem === 'H')) {
          return;
        }

        const idx1 = atom1.index !== undefined ? atom1.index : -1;
        const idx2 = atom2.index !== undefined ? atom2.index : -1;
        if (idx1 >= idx2) return;

        const bondKey = `${idx1}-${idx2}`;
        if (processedBonds.has(bondKey)) return;
        processedBonds.add(bondKey);

        let bondOrder = 1;
        if (atom1.bondOrder && atom1.bondOrder[i]) bondOrder = atom1.bondOrder[i];

        const dx = atom2.x - atom1.x;
        const dy = atom2.y - atom1.y;
        const dz = atom2.z - atom1.z;
        const bondLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const u = { x: dx / bondLen, y: dy / bondLen, z: dz / bondLen };
        let perp = { x: 0, y: 0, z: 0 };
        if (Math.abs(u.z) < 0.9) perp = { x: -u.y, y: u.x, z: 0 };
        else perp = { x: 0, y: -u.z, z: u.y };
        const pLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
        perp.x /= pLen; perp.y /= pLen; perp.z /= pLen;

        if (bondOrder === 2) {
          const off = 0.1;
          const s1 = { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off };
          const e1 = { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off };
          const s2 = { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off };
          const e2 = { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off };
          generateCylinder(s1, e1, 0.04);
          generateCylinder(s2, e2, 0.04);
        } else if (bondOrder === 3) {
          const off = 0.12;
          const s1 = { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off };
          const e1 = { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off };
          const s2 = { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off };
          const e2 = { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off };
          generateCylinder(atom1, atom2, 0.04);
          generateCylinder(s1, e1, 0.04);
          generateCylinder(s2, e2, 0.04);
        } else {
          generateCylinder(atom1, atom2, 0.08);
        }
      });
    });

    let obj = '# MolDraw OBJ export\n';
    obj += `# Vertices: ${outputVertices.length}\n`;
    obj += `# Faces: ${outputFaces.length}\n\n`;

    outputVertices.forEach(v => {
      obj += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`;
    });

    obj += '\ng MoleculeMesh\n';
    outputFaces.forEach(f => {
      obj += `f ${f[0]} ${f[1]} ${f[2]}\n`;
    });

    return obj;
  };

  // Helper: Convert to X3D format with atoms and bonds
  const convertToX3D = (viewer) => {
    const model = viewer.getModel(0);
    if (!model) return '';

    // Get all atoms from the model
    // 3Dmol stores atoms in a flat array, we can iterate them
    let atoms = model.selectedAtoms({});

    // Filter hydrogens if hidden
    if (!showHydrogens) {
      atoms = atoms.filter(a => a.elem !== 'H');
    }

    // Create a map for easy lookup by index/serial
    const atomMap = new Map();
    atoms.forEach((atom, idx) => {
      // Use serial or index as key. 3Dmol atoms usually have 'index' property.
      atomMap.set(atom.index !== undefined ? atom.index : idx, atom);
    });

    let x3d = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    x3d += `<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.0//EN" "http://www.web3d.org/specifications/x3d-3.0.dtd">\n`;
    x3d += `<X3D profile="Immersive" version="3.0">\n`;
    x3d += `  <Scene>\n`;
    x3d += `    <!-- Molecular Structure: ${atoms.length} atoms -->\n`;
    x3d += `    <Background skyColor="1 1 1"/>\n`;

    // Add atoms as spheres with Jmol colors
    atoms.forEach((atom, index) => {
      // 3Dmol atoms often have color property (int), convert to RGB string if available, else usage lookup
      let colorStr = getAtomColorRGB(atom.elem);
      if (atom.color) {
        const r = ((atom.color >> 16) & 255) / 255;
        const g = ((atom.color >> 8) & 255) / 255;
        const b = (atom.color & 255) / 255;
        colorStr = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
      }

      const radius = getAtomRadius(atom.elem);
      x3d += `    <!-- Atom ${index + 1}: ${atom.elem} at (${atom.x.toFixed(3)}, ${atom.y.toFixed(3)}, ${atom.z.toFixed(3)}) -->\n`;
      x3d += `    <Transform translation="${atom.x.toFixed(4)} ${atom.y.toFixed(4)} ${atom.z.toFixed(4)}">\n`;
      x3d += `      <Shape>\n`;
      x3d += `        <Sphere radius="${radius}"/>\n`;
      x3d += `        <Appearance>\n`;
      x3d += `          <Material diffuseColor="${colorStr}" specularColor="0.5 0.5 0.5" shininess="0.3" ambientIntensity="0.3"/>\n`;
      x3d += `        </Appearance>\n`;
      x3d += `      </Shape>\n`;
      x3d += `    </Transform>\n`;
    });

    // Process bonds (cylinders)
    // We iterate over atoms and their connections to avoid duplicates
    // Set to track processed bonds (smaller_index-larger_index)
    const processedBonds = new Set();

    atoms.forEach((atom1) => {
      if (!atom1.bonds) return;

      atom1.bonds.forEach((neighborIndex, i) => {
        // Avoid duplicates: only process if atom1 index < neighbor index
        // If neighborIndex is an actual index into atoms array:
        // Note: 3Dmol 'bonds' usually contains indices of other atoms in the atom list

        // Try to find the neighbor atom
        // In some versions of 3Dmol, bonds contains indices relative to the whole molecule/model list
        // We assume 'atoms' list corresponds to indices if filtered correctly, but better to look up by index property
        let atom2 = atomMap.get(neighborIndex);

        // If direct lookup fails (maybe localized selection), try to find by array index if matches
        if (!atom2 && neighborIndex < atoms.length) {
          atom2 = atoms[neighborIndex];
        }

        if (!atom2) return;

        // Enforce order to avoid double counting
        const idx1 = atom1.index !== undefined ? atom1.index : -1;
        const idx2 = atom2.index !== undefined ? atom2.index : -1;

        // If we have valid indices, use them for unique key. Else use object reference check?? simpler to just use ID behavior
        const id1 = idx1;
        const id2 = idx2;

        if (id1 >= id2) return; // Only process one direction

        const bondKey = `${id1}-${id2}`;
        if (processedBonds.has(bondKey)) return;
        processedBonds.add(bondKey);

        // Get bond order if available
        let bondOrder = 1;
        if (atom1.bondOrder && atom1.bondOrder[i]) {
          bondOrder = atom1.bondOrder[i];
        }

        // Draw Bond
        const dx = atom2.x - atom1.x;
        const dy = atom2.y - atom1.y;
        const dz = atom2.z - atom1.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Midpoint
        const midX = (atom1.x + atom2.x) / 2;
        const midY = (atom1.y + atom2.y) / 2;
        const midZ = (atom1.z + atom2.z) / 2;

        // Rotation
        const bondVector = { x: dx, y: dy, z: dz };
        const yAxis = { x: 0, y: 1, z: 0 };
        const rotAxis = {
          x: yAxis.y * bondVector.z - yAxis.z * bondVector.y,
          y: yAxis.z * bondVector.x - yAxis.x * bondVector.z,
          z: yAxis.x * bondVector.y - yAxis.y * bondVector.x
        };
        let rotAxisLen = Math.sqrt(rotAxis.x * rotAxis.x + rotAxis.y * rotAxis.y + rotAxis.z * rotAxis.z);
        let angle = 0;
        let axisStr = "0 1 0";

        if (rotAxisLen > 0.0001) {
          rotAxis.x /= rotAxisLen;
          rotAxis.y /= rotAxisLen;
          rotAxis.z /= rotAxisLen;
          const dotProduct = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / length;
          angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          axisStr = `${rotAxis.x.toFixed(4)} ${rotAxis.y.toFixed(4)} ${rotAxis.z.toFixed(4)}`;
        } else {
          // Parallel or anti-parallel
          const dotProduct = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / length;
          if (dotProduct < 0) {
            // Antiparallel, rotate 180 deg around X
            axisStr = "1 0 0";
            angle = Math.PI;
          }
        }

        // Render based on bond order
        if (bondOrder === 2) {
          // Double bond: two parallel cylinders
          const offset = 0.1; // Offset from center
          // We need a vector perpendicular to bond vector to offset
          // We can use rotAxis if it's stable, or arbitrary perpendicular

          // Construct a transformation matrix for the bond to calculate offset in world space?
          // Simpler: Just put two cylinders in the local space of the transform (which aligns Y with bond)
          // In local space, bond is along Y. Offset along X is safe.

          x3d += `    <!-- Double Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          x3d += `      <Transform translation="${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `      <Transform translation="-${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `    </Transform>\n`;

        } else if (bondOrder === 3) {
          // Triple bond
          const offset = 0.12;
          x3d += `    <!-- Triple Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          // Center
          x3d += `      <Shape>\n`;
          x3d += `        <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `        <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `      </Shape>\n`;
          // Side 1
          x3d += `      <Transform translation="${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          // Side 2
          x3d += `      <Transform translation="-${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `    </Transform>\n`;
        } else {
          // Single bond (default)
          x3d += `    <!-- Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          x3d += `      <Shape>\n`;
          x3d += `        <Cylinder radius="0.08" height="${length.toFixed(4)}"/>\n`;
          x3d += `        <Appearance>\n`;
          x3d += `          <Material diffuseColor="0.7 0.7 0.7" specularColor="0.3 0.3 0.3" shininess="0.2"/>\n`;
          x3d += `        </Appearance>\n`;
          x3d += `      </Shape>\n`;
          x3d += `    </Transform>\n`;
        }
      });
    });

    x3d += `  </Scene>\n</X3D>`;
    return x3d;
  };

  // Get atom color in RGB string format
  const getAtomColorRGB = (elem) => {
    const colors = {
      'H': '1.0 1.0 1.0', 'C': '0.6 0.6 0.6', 'N': '0.2 0.2 1.0',
      'O': '1.0 0.05 0.05', 'S': '1.0 1.0 0.2', 'P': '1.0 0.5 0.0',
      'F': '0.7 1.0 1.0', 'Cl': '0.1 1.0 0.1', 'Br': '0.6 0.2 0.2'
    };
    return colors[elem] || '0.5 0.5 0.5';
  };

  // Get atom radius
  const getAtomRadius = (elem) => {
    const radii = {
      'H': 0.20, 'C': 0.28, 'N': 0.27, 'O': 0.26,
      'S': 0.32, 'P': 0.32, 'F': 0.25, 'Cl': 0.30
    };
    return radii[elem] || 0.25;
  };

  return (
    <div className="App">
      <div className="split-container">
        {/* Left: Ketcher 2D Editor */}
        <div className="panel ketcher-panel" data-testid="ketcher-panel">
          {/* Brand Header */}
          <div className="brand-header">
            <div className="brand-name">
              <img src="/logo.svg" alt="MolDraw" className="brand-logo" />
              <span className="brand-by-text">by <a href="https://scidart.com" target="_blank" rel="noopener noreferrer" className="brand-by-link">scidart.com</a></span>
            </div>
            <div className="header-links">
              <a
                href="/course/index.html"
                className="header-nav-link"
                target="_blank"
                rel="noopener noreferrer"
                title="Learn how to use MolDraw"
              >
                Course
              </a>
              <a
                href="/pages/about.html"
                className="header-nav-link"
                target="_blank"
                rel="noopener noreferrer"
                title="About MolDraw"
              >
                About
              </a>
            </div>
          </div>

          {/* Molecule Search Bar */}
          <div className="molecule-search-bar">
            <div className="search-container">
              <input
                type="text"
                className="search-input"
                placeholder="Search molecule (e.g., aspirin, benzene, caffeine)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    searchMoleculeByName(searchQuery);
                  }
                }}
                disabled={isSearching}
              />
              <button
                className="search-btn"
                onClick={() => searchMoleculeByName(searchQuery)}
                disabled={isSearching || !searchQuery.trim()}
                title="Search molecule by name"
              >
                {isSearching ? (
                  <div className="btn-spinner"></div>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                )}
              </button>
            </div>
            {searchError && (
              <div className="search-error">{searchError}</div>
            )}
          </div>

          <iframe
            ref={iframeRef}
            src="/ketcher-bridge.html"
            title="Ketcher Molecule Editor"
            className="ketcher-iframe"
            data-testid="ketcher-iframe"
          />
        </div>

        {/* Right: 3D Viewer */}
        <div className={`panel viewer-panel ${!is3DPanelOpen ? 'minimized' : ''}`} data-testid="viewer-panel">
          {/* Toggle Button */}
          <button
            className="panel-toggle-btn"
            onClick={() => setIs3DPanelOpen(!is3DPanelOpen)}
            title={is3DPanelOpen ? "Minimize 3D panel" : "Open 3D panel"}
          >
            {is3DPanelOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            )}
          </button>

          {is3DPanelOpen && (
            <>
              {/* Molecule Name Display */}
              {moleculeName && (
                <div className="molecule-name-banner">
                  <div className="molecule-name-content">
                    <span className="name-label">Identified:</span>
                    <span className="name-text">{moleculeName}</span>
                  </div>
                </div>
              )}

              <div
                ref={viewer3DRef}
                className="viewer-3d"
                data-testid="viewer-3d"
              />

              {/* Feedback Chat Widget */}
              <div className="feedback-widget">
                {/* Chat Bubble Button */}
                <button
                  className="feedback-bubble"
                  onClick={() => setIsFeedbackOpen(!isFeedbackOpen)}
                  title="Share your feedback"
                  aria-label="Open feedback form"
                >
                  {isFeedbackOpen ? '✕' : '💬'}
                </button>

                {/* Chat Box */}
                {isFeedbackOpen && (
                  <div className="feedback-chat-box">
                    <div className="feedback-chat-header">
                      <div className="feedback-chat-title">
                        <span className="feedback-chat-icon">💬</span>
                        <span>Give Feedback</span>
                      </div>
                      <button
                        className="feedback-chat-close"
                        onClick={() => setIsFeedbackOpen(false)}
                        aria-label="Close feedback form"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="feedback-chat-content">
                      <div className="feedback-chat-message">
                        <p>Help us improve MolDraw! Share your thoughts, suggestions, or report any issues.</p>
                      </div>
                      <div className="feedback-chat-form">
                        <iframe
                          src="https://forms.scidart.com/qg3zpn"
                          title="MolDraw feedback form"
                          className="feedback-iframe"
                          loading="lazy"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Controls */}
              <div className="floating-controls">
                {/* Style and Color Row */}
                <div className="control-row">
                  <select
                    value={renderStyle}
                    onChange={(e) => setRenderStyle(e.target.value)}
                    className="compact-select"
                    title="Rendering style"
                  >
                    <option value="ball-stick">Ball & Stick</option>
                    <option value="stick">Stick</option>
                    <option value="sphere">Space-Fill</option>
                    <option value="line">Line</option>
                  </select>
                </div>

                {/* Hydrogen Toggle */}
                <button
                  className={`compact-btn ${showHydrogens ? 'active' : ''}`}
                  onClick={toggleHydrogens}
                  title="Toggle hydrogen atoms"
                  data-testid="toggle-hydrogen-btn"
                >
                  <span className="btn-icon">H</span>
                  {showHydrogens ? 'Hide' : 'Show'}
                </button>

                {/* Export Row */}
                {currentMolecule && (
                  <div className="export-row">
                    <button onClick={() => exportModel('png')} className="compact-export-btn" title="PNG (transparent)">PNG</button>
                    <button onClick={() => exportModel('sdf')} className="compact-export-btn" title="SDF format">SDF</button>
                    <button onClick={() => exportModel('xyz')} className="compact-export-btn" title="XYZ format">XYZ</button>
                    <button onClick={() => exportModel('x3d')} className="compact-export-btn" title="X3D with bonds">X3D</button>
                    <button onClick={() => exportModel('obj')} className="compact-export-btn" title="OBJ for Blender">OBJ</button>
                  </div>
                )}

                {isConverting && (
                  <div className="compact-status">
                    <div className="spinner"></div>
                    <span>Converting...</span>
                  </div>
                )}

                {isNaming && (
                  <div className="compact-status">
                    <div className="spinner"></div>
                    <span>Identifying...</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!is3DReady && is3DPanelOpen && (
            <div className="loading-3d">Loading 3D Viewer...</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;