#!/bin/bash

echo "Select worker node to stress:"
echo " [1] Worker 1 "
echo " [2] Worker 2 "
echo " [3] Worker 3 "
echo " [4] Worker 4 "
echo ""

read -p "Enter selection (1-4): " SELECTION

case $SELECTION in
	1)
		kubectl apply -f stress-worker1.yaml
		echo "Stress test started on Worker 1"
		;;
	2)
		kubectl apply -f stress-worker2.yaml
		echo "Stress test started on Worker 2"
		;;
	3)
		kubectl apply -f stress-worker3.yaml
		echo "Stress test started on Worker 3"
		;;
	4)
		kubectl apply -f stress-worker4.yaml
		echo "Stress test started on Worker 4"
		;;
	*)
		echo "Invalid selection"
		exit 1
		;;
esac
