import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA5Z5ieEbAcfQX0kxGSn9ldGXhzvAwx_8M",
  authDomain: "chat-294cc.firebaseapp.com",
  databaseURL: "https://chat-294cc-default-rtdb.firebaseio.com",
  projectId: "chat-294cc",
  storageBucket: "chat-294cc.appspot.com",
  messagingSenderId: "913615304269",
  appId: "1:913615304269:web:0274ffaccb8e6b678e4e04",
  measurementId: "G-SJR9NDW86B"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
